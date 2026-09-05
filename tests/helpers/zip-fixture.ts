/** 按 ZIP 规范手工拼压缩包的测试夹具。见 tests/imports-zip.test.mjs 里的说明。 */
import { crc32 as zlibCrc32, deflateRawSync } from "node:zlib";

const SIGNATURE_LOCAL = 0x04034b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_ZIP64_EOCD = 0x06064b50;
const SIGNATURE_ZIP64_LOCATOR = 0x07064b50;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;

/**
 * 一个待打进包的条目。字段刻意留了各种"打歪"的开关（`corruptData` / `crcOverride` /
 * `encrypted` / `utf8: false`），被测代码要挡的正是这些真实世界里的坏包。
 */
type ZipFileSpec = {
  readonly name: string;
  /** 直接指定文件名字节，用来构造非 UTF-8（GBK 等）文件名。 */
  readonly nameBytes?: Buffer;
  readonly data?: Buffer;
  /** 0 = 存储，8 = deflate（默认）。 */
  readonly method?: number;
  readonly corruptData?: boolean;
  readonly crcOverride?: number;
  readonly utf8?: boolean;
  readonly encrypted?: boolean;
};

type ZipOptions = { readonly zip64?: boolean };

/**
 * 按 ZIP 规范手工拼一个压缩包。刻意不用现成的打包库：被测代码要对付的正是真实世界里
 * 各种压缩工具产出的字节，用同一个库编解只会自证其说。
 */
function buildZip(files: readonly ZipFileSpec[], options: ZipOptions = {}): Blob {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = file.nameBytes ?? Buffer.from(file.name, "utf8");
    const raw = file.data ?? Buffer.alloc(0);
    const method = file.method ?? 8;
    const stored = method === 0 ? raw : deflateRawSync(raw);
    const payload = file.corruptData ? Buffer.alloc(stored.length, 0x00) : stored;
    const checksum = file.crcOverride ?? zlibCrc32(raw);
    const flags = (file.utf8 === false ? 0 : FLAG_UTF8) | (file.encrypted ? FLAG_ENCRYPTED : 0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIGNATURE_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIGNATURE_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + payload.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);
  const centralOffset = localBlock.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIGNATURE_EOCD, 0);
  eocd.writeUInt16LE(options.zip64 ? 0xffff : files.length, 8);
  eocd.writeUInt16LE(options.zip64 ? 0xffff : files.length, 10);
  eocd.writeUInt32LE(options.zip64 ? 0xffffffff : centralBlock.length, 12);
  eocd.writeUInt32LE(options.zip64 ? 0xffffffff : centralOffset, 16);

  if (!options.zip64) {
    return new Blob([Buffer.concat([localBlock, centralBlock, eocd])]);
  }

  const zip64Offset = centralOffset + centralBlock.length;
  const zip64 = Buffer.alloc(56);
  zip64.writeUInt32LE(SIGNATURE_ZIP64_EOCD, 0);
  zip64.writeBigUInt64LE(BigInt(44), 4);
  zip64.writeUInt16LE(45, 12);
  zip64.writeUInt16LE(45, 14);
  zip64.writeBigUInt64LE(BigInt(files.length), 24);
  zip64.writeBigUInt64LE(BigInt(files.length), 32);
  zip64.writeBigUInt64LE(BigInt(centralBlock.length), 40);
  zip64.writeBigUInt64LE(BigInt(centralOffset), 48);

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(SIGNATURE_ZIP64_LOCATOR, 0);
  locator.writeBigUInt64LE(BigInt(zip64Offset), 8);
  locator.writeUInt32LE(1, 16);

  return new Blob([Buffer.concat([localBlock, centralBlock, zip64, locator, eocd])]);
}

export { buildZip };

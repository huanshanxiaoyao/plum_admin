/**
 * 只读 ZIP 解析。不引第三方库：容器格式只需读两段定长结构，解压交给平台的
 * `DecompressionStream('deflate-raw')`（Chrome 103+ / Safari 16.4+ / Firefox 113+ / Node 18+）。
 *
 * 关键设计是**惰性**：`open()` 只读末尾的中央目录拿到条目表，条目内容按需 `read()`。
 * 单包上限 600 MB，一次性展开会打爆浏览器标签页，所以任何调用方都不该遍历 `entries` 全量读取。
 */

const SIGNATURE_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const SIGNATURE_ZIP64_LOCATOR = 0x07064b50;
const SIGNATURE_ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const SIGNATURE_CENTRAL_FILE_HEADER = 0x02014b50;
const SIGNATURE_LOCAL_FILE_HEADER = 0x04034b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const ZIP64_MARKER_32 = 0xffffffff;
const ZIP64_MARKER_16 = 0xffff;

const END_OF_CENTRAL_DIRECTORY_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;

export type ZipErrorCode =
  | "not_a_zip"
  | "unsupported_zip64"
  | "encrypted"
  | "unsupported_compression"
  | "corrupt_entry"
  | "crc_mismatch"
  | "unsafe_path";

export class ZipError extends Error {
  readonly code: ZipErrorCode;
  readonly path?: string;

  constructor(code: ZipErrorCode, message: string, path?: string) {
    super(message);
    this.name = "ZipError";
    this.code = code;
    this.path = path;
  }
}

export type ZipEntry = {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly encrypted: boolean;
  /**
   * 压缩包是否声明该文件名为 UTF-8。为 false 且名字含非 ASCII 字节时，`path` 按 UTF-8
   * 宽松解码，很可能是乱码——调用方应据此报错并让运营改用英文文件名，而不是拿它去比对路径。
   */
  readonly utf8Name: boolean;
  readonly nonAsciiName: boolean;
  readonly localHeaderOffset: number;
};

let crcTable: Uint32Array | null = null;

function crc32Table(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = crc32Table();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readU64(view: DataView, offset: number): number {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ZipError("unsupported_zip64", "压缩包超出可处理的大小。");
  }
  return Number(value);
}

const utf8Decoder = new TextDecoder("utf-8");

function decodeName(bytes: Uint8Array): { name: string; nonAscii: boolean } {
  let nonAscii = false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] >= 0x80) {
      nonAscii = true;
      break;
    }
  }
  return { name: utf8Decoder.decode(bytes), nonAscii };
}

/** 控制字符在合法文件名里不会出现，出现即为构造过的包。 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/;

/**
 * 路径穿越防御。压缩包由运营提供，但一个被构造过的包不该有机会写到 `images/` 之外，
 * 所以这里直接拒绝而不是交给上层判断。
 */
function assertSafePath(path: string): void {
  if (path.length === 0) {
    throw new ZipError("unsafe_path", "压缩包里有空文件名的条目。");
  }
  if (CONTROL_CHARACTERS.test(path)) {
    throw new ZipError("unsafe_path", "压缩包里有文件名非法的条目。", path);
  }
  if (path.startsWith("/") || WINDOWS_DRIVE_PREFIX.test(path)) {
    throw new ZipError("unsafe_path", `压缩包里有绝对路径条目：${path}`, path);
  }
  if (path.includes("\\")) {
    throw new ZipError("unsafe_path", `压缩包里的路径含反斜杠：${path}`, path);
  }
  if (path.split("/").some((segment) => segment === "..")) {
    throw new ZipError("unsafe_path", `压缩包里有向上跳目录的路径：${path}`, path);
  }
}

async function sliceBytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

type CentralDirectoryLocation = {
  readonly offset: number;
  readonly size: number;
  readonly entryCount: number;
};

async function locateCentralDirectory(blob: Blob): Promise<CentralDirectoryLocation> {
  const tailSize = Math.min(blob.size, END_OF_CENTRAL_DIRECTORY_MIN_SIZE + MAX_COMMENT_SIZE);
  if (tailSize < END_OF_CENTRAL_DIRECTORY_MIN_SIZE) {
    throw new ZipError("not_a_zip", "这不是一个有效的压缩包。");
  }
  const tail = await sliceBytes(blob, blob.size - tailSize, blob.size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  let eocd = -1;
  for (let index = tail.length - END_OF_CENTRAL_DIRECTORY_MIN_SIZE; index >= 0; index -= 1) {
    if (tailView.getUint32(index, true) === SIGNATURE_END_OF_CENTRAL_DIRECTORY) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    throw new ZipError("not_a_zip", "这不是一个有效的压缩包，或者文件在传输中被截断了。");
  }

  const entryCount = tailView.getUint16(eocd + 10, true);
  const size = tailView.getUint32(eocd + 12, true);
  const offset = tailView.getUint32(eocd + 16, true);

  const needsZip64 =
    entryCount === ZIP64_MARKER_16 || size === ZIP64_MARKER_32 || offset === ZIP64_MARKER_32;
  if (!needsZip64) return { offset, size, entryCount };

  const locator = eocd - 20;
  if (locator < 0 || tailView.getUint32(locator, true) !== SIGNATURE_ZIP64_LOCATOR) {
    throw new ZipError("unsupported_zip64", "压缩包缺少 ZIP64 结构，无法读取。");
  }
  const zip64Offset = readU64(tailView, locator + 8);
  const zip64 = await sliceBytes(blob, zip64Offset, zip64Offset + 56);
  const zip64View = new DataView(zip64.buffer, zip64.byteOffset, zip64.byteLength);
  if (zip64View.getUint32(0, true) !== SIGNATURE_ZIP64_END_OF_CENTRAL_DIRECTORY) {
    throw new ZipError("unsupported_zip64", "压缩包的 ZIP64 结构不完整。");
  }
  return {
    entryCount: readU64(zip64View, 32),
    size: readU64(zip64View, 40),
    offset: readU64(zip64View, 48),
  };
}

type OverflowableSizes = {
  uncompressedSize: number;
  compressedSize: number;
  localHeaderOffset: number;
};

/** 解析 ZIP64 扩展字段，只取被 0xFFFFFFFF 标记为溢出的那几项。出现顺序由规范固定。 */
function applyZip64Extra(extra: Uint8Array, sizes: OverflowableSizes): void {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const headerId = view.getUint16(cursor, true);
    const dataSize = view.getUint16(cursor + 2, true);
    const dataStart = cursor + 4;
    if (headerId === 0x0001) {
      let field = dataStart;
      if (sizes.uncompressedSize === ZIP64_MARKER_32 && field + 8 <= dataStart + dataSize) {
        sizes.uncompressedSize = readU64(view, field);
        field += 8;
      }
      if (sizes.compressedSize === ZIP64_MARKER_32 && field + 8 <= dataStart + dataSize) {
        sizes.compressedSize = readU64(view, field);
        field += 8;
      }
      if (sizes.localHeaderOffset === ZIP64_MARKER_32 && field + 8 <= dataStart + dataSize) {
        sizes.localHeaderOffset = readU64(view, field);
      }
      return;
    }
    cursor = dataStart + dataSize;
  }
}

export class ZipArchive {
  readonly entries: readonly ZipEntry[];
  readonly #blob: Blob;
  readonly #byPath: ReadonlyMap<string, ZipEntry>;

  private constructor(blob: Blob, entries: readonly ZipEntry[]) {
    this.#blob = blob;
    this.entries = entries;
    this.#byPath = new Map(entries.map((entry) => [entry.path, entry]));
  }

  /** 只读末尾的中央目录，不解压任何内容。 */
  static async open(blob: Blob): Promise<ZipArchive> {
    const location = await locateCentralDirectory(blob);
    const directory = await sliceBytes(blob, location.offset, location.offset + location.size);
    const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);

    const entries: ZipEntry[] = [];
    let cursor = 0;
    for (let index = 0; index < location.entryCount; index += 1) {
      if (
        cursor + 46 > directory.length ||
        view.getUint32(cursor, true) !== SIGNATURE_CENTRAL_FILE_HEADER
      ) {
        throw new ZipError("corrupt_entry", "压缩包的目录结构已损坏，请重新压缩后再试。");
      }
      const flags = view.getUint16(cursor + 8, true);
      const compressionMethod = view.getUint16(cursor + 10, true);
      const entryCrc = view.getUint32(cursor + 16, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);

      const sizes: OverflowableSizes = {
        compressedSize: view.getUint32(cursor + 20, true),
        uncompressedSize: view.getUint32(cursor + 24, true),
        localHeaderOffset: view.getUint32(cursor + 42, true),
      };

      const nameStart = cursor + 46;
      const extraStart = nameStart + nameLength;
      if (extraLength > 0) {
        applyZip64Extra(directory.subarray(extraStart, extraStart + extraLength), sizes);
      }

      const decoded = decodeName(directory.subarray(nameStart, extraStart));
      assertSafePath(decoded.name);

      entries.push({
        path: decoded.name,
        isDirectory: decoded.name.endsWith("/"),
        compressedSize: sizes.compressedSize,
        uncompressedSize: sizes.uncompressedSize,
        compressionMethod,
        crc32: entryCrc,
        encrypted: (flags & 0x0001) !== 0,
        utf8Name: (flags & 0x0800) !== 0,
        nonAsciiName: decoded.nonAscii,
        localHeaderOffset: sizes.localHeaderOffset,
      });

      cursor = extraStart + extraLength + commentLength;
    }

    return new ZipArchive(blob, entries);
  }

  find(path: string): ZipEntry | undefined {
    return this.#byPath.get(path);
  }

  /** 解压单个条目并校验 CRC。调用方负责不要把整包都读进内存。 */
  async read(entry: ZipEntry): Promise<Uint8Array> {
    if (entry.encrypted) {
      throw new ZipError("encrypted", `压缩包设了密码，无法读取：${entry.path}`, entry.path);
    }
    if (entry.compressionMethod !== METHOD_STORE && entry.compressionMethod !== METHOD_DEFLATE) {
      throw new ZipError(
        "unsupported_compression",
        `压缩方式不支持：${entry.path}。请用系统自带的压缩功能重新打包。`,
        entry.path,
      );
    }

    const header = await sliceBytes(
      this.#blob,
      entry.localHeaderOffset,
      entry.localHeaderOffset + 30,
    );
    if (header.length < 30) {
      throw new ZipError("corrupt_entry", `条目已损坏：${entry.path}`, entry.path);
    }
    const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (headerView.getUint32(0, true) !== SIGNATURE_LOCAL_FILE_HEADER) {
      throw new ZipError("corrupt_entry", `条目已损坏：${entry.path}`, entry.path);
    }
    // 本地头的名字/扩展长度可能与中央目录不同，必须按本地头算数据起点。
    const dataStart =
      entry.localHeaderOffset + 30 + headerView.getUint16(26, true) + headerView.getUint16(28, true);
    const compressed = this.#blob.slice(dataStart, dataStart + entry.compressedSize);

    let bytes: Uint8Array;
    if (entry.compressionMethod === METHOD_STORE) {
      bytes = new Uint8Array(await compressed.arrayBuffer());
    } else {
      try {
        bytes = new Uint8Array(
          await new Response(
            compressed.stream().pipeThrough(new DecompressionStream("deflate-raw")),
          ).arrayBuffer(),
        );
      } catch {
        // 解压失败抛的是平台的原生错误，直接冒泡上去运营只会看到一句英文。
        throw new ZipError(
          "corrupt_entry",
          `条目解压失败，压缩包可能在传输中损坏：${entry.path}。请重新压缩后再试。`,
          entry.path,
        );
      }
    }

    if (bytes.length !== entry.uncompressedSize) {
      throw new ZipError("corrupt_entry", `条目解压后大小不符：${entry.path}`, entry.path);
    }
    if (crc32(bytes) !== entry.crc32) {
      throw new ZipError("crc_mismatch", `条目校验失败，文件可能已损坏：${entry.path}`, entry.path);
    }
    return bytes;
  }

  /** manifest 用。`fatal: true` 让非 UTF-8 的表格立刻报错，而不是解出一串乱码往下走。 */
  async readText(entry: ZipEntry): Promise<string> {
    return new TextDecoder("utf-8", { fatal: true }).decode(await this.read(entry));
  }

  /** 直传用：拿到可直接 POST 的 Blob。 */
  async readBlob(entry: ZipEntry, type: string): Promise<Blob> {
    return new Blob([await this.read(entry)], { type });
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { crc32 as zlibCrc32 } from "node:zlib";
import { ZipArchive, ZipError, crc32 } from "../features/imports/zip-reader.ts";
import { buildZip } from "./helpers/zip-fixture.ts";

const MANIFEST = "row_key,display_name\n001_luna,Luna\n";

test("crc32 与 zlib 的实现一致", () => {
  const bytes = Buffer.from("plum 角色批量导入", "utf8");
  assert.equal(crc32(new Uint8Array(bytes)), zlibCrc32(bytes));
});

test("读取 deflate 压缩的条目", async () => {
  const archive = await ZipArchive.open(
    buildZip([{ name: "manifest.csv", data: Buffer.from(MANIFEST.repeat(20), "utf8") }]),
  );
  const entry = archive.find("manifest.csv");
  assert.ok(entry);
  assert.equal(entry.compressionMethod, 8);
  assert.equal(await archive.readText(entry), MANIFEST.repeat(20));
});

test("读取 store（不压缩）的条目", async () => {
  const archive = await ZipArchive.open(
    buildZip([{ name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8"), method: 0 }]),
  );
  const entry = archive.find("manifest.csv");
  assert.equal(entry.compressionMethod, 0);
  assert.equal(await archive.readText(entry), MANIFEST);
});

test("多条目与目录项都能列出", async () => {
  const archive = await ZipArchive.open(
    buildZip([
      { name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8") },
      { name: "images/", method: 0 },
      { name: "images/001_luna.png", data: Buffer.from("fake-png-bytes") },
    ]),
  );
  assert.deepEqual(
    archive.entries.map((entry) => [entry.path, entry.isDirectory]),
    [
      ["manifest.csv", false],
      ["images/", true],
      ["images/001_luna.png", false],
    ],
  );
});

test("open 只读中央目录：数据区损坏时仍能列出条目，读取时才报错", async () => {
  // 这是惰性解压的直接证据。600 MB 的包若在 open 阶段就展开，浏览器会崩。
  const archive = await ZipArchive.open(
    buildZip([{ name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8"), corruptData: true }]),
  );
  assert.equal(archive.entries.length, 1);
  await assert.rejects(() => archive.read(archive.find("manifest.csv")), (caught) => {
    assert.ok(caught instanceof ZipError);
    return true;
  });
});

test("CRC 不匹配时报错，而不是把损坏内容当正常数据往下传", async () => {
  const archive = await ZipArchive.open(
    buildZip([
      { name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8"), method: 0, crcOverride: 12345 },
    ]),
  );
  await assert.rejects(
    () => archive.read(archive.find("manifest.csv")),
    (caught) => {
      assert.equal(caught.code, "crc_mismatch");
      return true;
    },
  );
});

test("加密的包被拒绝", async () => {
  const archive = await ZipArchive.open(
    buildZip([{ name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8"), encrypted: true }]),
  );
  await assert.rejects(
    () => archive.read(archive.find("manifest.csv")),
    (caught) => {
      assert.equal(caught.code, "encrypted");
      return true;
    },
  );
});

test("不支持的压缩方式被拒绝", async () => {
  const archive = await ZipArchive.open(
    buildZip([{ name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8"), method: 0 }]),
  );
  // 直接改写条目上的方法号，模拟 bzip2 / lzma 之类的包。
  const entry = { ...archive.find("manifest.csv"), compressionMethod: 12 };
  await assert.rejects(
    () => archive.read(entry),
    (caught) => {
      assert.equal(caught.code, "unsupported_compression");
      return true;
    },
  );
});

test("路径穿越、绝对路径和反斜杠在 open 阶段就被拒绝", async () => {
  for (const name of ["../etc/passwd", "/etc/passwd", "images\\a.png", "a/../../b"]) {
    await assert.rejects(
      () => ZipArchive.open(buildZip([{ name, data: Buffer.from("x") }])),
      (caught) => {
        assert.equal(caught.code, "unsafe_path");
        return true;
      },
      name,
    );
  }
});

test("未标记 UTF-8 的非 ASCII 文件名被标出来，而不是当作正常路径", async () => {
  const archive = await ZipArchive.open(
    buildZip([
      {
        name: "images/x.png",
        // GBK 的「立绘.png」，Windows 的压缩工具会产出这种没有 UTF-8 标志位的名字。
        nameBytes: Buffer.concat([
          Buffer.from("images/", "ascii"),
          Buffer.from([0xc1, 0xa2, 0xbb, 0xe6]),
          Buffer.from(".png", "ascii"),
        ]),
        utf8: false,
        data: Buffer.from("x"),
      },
    ]),
  );
  const entry = archive.entries[0];
  assert.equal(entry.utf8Name, false);
  assert.equal(entry.nonAsciiName, true);
});

test("正常的 UTF-8 文件名不会被误判", async () => {
  const archive = await ZipArchive.open(
    buildZip([{ name: "images/立绘.png", data: Buffer.from("x") }]),
  );
  assert.equal(archive.entries[0].utf8Name, true);
  assert.equal(archive.entries[0].nonAsciiName, true);
  assert.equal(archive.entries[0].path, "images/立绘.png");
});

test("ZIP64 结构的包能正确定位中央目录", async () => {
  const archive = await ZipArchive.open(
    buildZip(
      [
        { name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8") },
        { name: "images/001_luna.png", data: Buffer.from("fake-png-bytes") },
      ],
      { zip64: true },
    ),
  );
  assert.deepEqual(
    archive.entries.map((entry) => entry.path),
    ["manifest.csv", "images/001_luna.png"],
  );
  assert.equal(await archive.readText(archive.find("manifest.csv")), MANIFEST);
});

test("非 ZIP 文件给出明确错误", async () => {
  await assert.rejects(
    () => ZipArchive.open(new Blob([Buffer.from("这不是一个压缩包".repeat(10))])),
    (caught) => {
      assert.equal(caught.code, "not_a_zip");
      return true;
    },
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { groupIssuesByRow, readPackage } from "../features/imports/package-reader.ts";
import { runUploads, succeededPortraits } from "../features/imports/upload-orchestrator.ts";
import {
  RESULT_COLUMNS,
  buildResultManifest,
  resultManifestFilename,
} from "../features/imports/result-export.ts";
import { summarize } from "../features/imports/import-contracts.ts";
import { parseCsv } from "../features/imports/csv.ts";
import { centerCrop } from "../features/imports/import-api.ts";
import { buildZip } from "./helpers/zip-fixture.mjs";

const HEADER =
  "row_key,display_name,gender,intro,opening_scene,character_settings,creator_declared_rating,portrait_file";

function manifest(...rows) {
  return `${HEADER}\n${rows.join("\n")}\n`;
}

function row(key) {
  return `${key},Luna,female,简介,开场,设定,general,images/${key}.png`;
}

function goodPackage() {
  return buildZip([
    { name: "manifest.csv", data: Buffer.from(manifest(row("001"), row("002")), "utf8") },
    { name: "images/", method: 0 },
    { name: "images/001.png", data: Buffer.from("fake-png-001") },
    { name: "images/002.png", data: Buffer.from("fake-png-002") },
  ]);
}

const codes = (issues) => issues.filter((i) => i.severity === "error").map((i) => i.code);

// --- 解包 ---

test("完整的包读出行、列与图片清单", async () => {
  const result = await readPackage(goodPackage());
  assert.deepEqual(codes(result.issues), []);
  assert.equal(result.manifestFormat, "csv");
  assert.equal(result.rows.length, 2);
  assert.deepEqual([...result.images.keys()].sort(), ["images/001.png", "images/002.png"]);
  assert.equal(result.images.get("images/001.png").contentType, "image/png");
});

test("图片不在解包阶段解压——只带着条目引用", async () => {
  // 600 MB 的包若在这里展开会打爆标签页，所以只保留 ZipEntry，等上传时逐张取。
  const result = await readPackage(goodPackage());
  const image = result.images.get("images/001.png");
  assert.ok(image.entry);
  assert.equal(typeof image.entry.localHeaderOffset, "number");
  assert.equal("bytes" in image, false);
  // 需要时仍然能取到真实内容。
  assert.equal(Buffer.from(await result.archive.read(image.entry)).toString(), "fake-png-001");
});

test("非 zip 文件给出可读的错误，而不是抛到界面上", async () => {
  const result = await readPackage(new Blob([Buffer.from("我不是压缩包".repeat(20))]));
  assert.deepEqual(codes(result.issues), ["not_a_zip"]);
  assert.equal(result.archive, undefined);
});

test("超过单包大小上限时不解包，直接报错并给出实际大小", async () => {
  const oversized = { size: 700 * 1024 * 1024 };
  const result = await readPackage(oversized);
  const issue = result.issues[0];
  assert.equal(issue.code, "package_too_large");
  assert.match(issue.message, /700 MB/);
  assert.match(issue.message, /600 MB/);
});

test("非 UTF-8 的表格给出指向另存为 CSV UTF-8 的错误", async () => {
  const result = await readPackage(
    buildZip([
      // GBK 编码的表头，UTF-8 严格解码会失败。
      { name: "manifest.csv", data: Buffer.from([0xc1, 0xa2, 0xbb, 0xe6, 0x2c, 0x61]) },
    ]),
  );
  assert.deepEqual(codes(result.issues), ["manifest_not_utf8"]);
});

test("结构问题与逐行问题一起返回，不是遇到第一个就停", async () => {
  const result = await readPackage(
    buildZip([
      { name: "manifest.csv", data: Buffer.from(manifest(row("001"), row("001")), "utf8") },
      { name: "readme.txt", data: Buffer.from("多余文件") },
      { name: "images/001.png", data: Buffer.from("fake") },
    ]),
  );
  assert.deepEqual(codes(result.issues).sort(), ["row_key_duplicated", "unexpected_file"]);
});

test("按行归拢错误，包级问题归到 null 键", async () => {
  const result = await readPackage(
    buildZip([
      { name: "manifest.csv", data: Buffer.from(manifest(row("001"), row("001")), "utf8") },
      { name: "readme.txt", data: Buffer.from("x") },
      { name: "images/001.png", data: Buffer.from("fake") },
    ]),
  );
  const grouped = groupIssuesByRow(result.issues);
  assert.deepEqual(grouped.get("001").map((i) => i.code), ["row_key_duplicated"]);
  assert.deepEqual(grouped.get(null).map((i) => i.code), ["unexpected_file"]);
});

// --- 上传编排 ---

function tasks(...keys) {
  return keys.map((rowKey) => ({ rowKey, image: { path: `images/${rowKey}.png` } }));
}

function fakeTransport(behaviour = {}) {
  const seen = [];
  return {
    seen,
    async upload(task) {
      seen.push(task.rowKey);
      const outcome = behaviour[task.rowKey];
      if (outcome === "fail") throw new Error(`上传失败：${task.rowKey}`);
      return { mediaId: `med_${task.rowKey}`, imageSetId: `imgset_${task.rowKey}` };
    },
  };
}

test("全部成功时按原始顺序返回结果", async () => {
  const outcomes = await runUploads(tasks("a", "b", "c"), fakeTransport(), { concurrency: 2 });
  assert.deepEqual(outcomes.map((o) => o.rowKey), ["a", "b", "c"]);
  assert.equal(outcomes.every((o) => o.ok), true);
  assert.equal(outcomes[0].portrait.mediaId, "med_a");
});

test("单张失败只影响该行，其余继续传完", async () => {
  const outcomes = await runUploads(tasks("a", "b", "c"), fakeTransport({ b: "fail" }), {
    concurrency: 1,
  });
  assert.deepEqual(
    outcomes.map((o) => [o.rowKey, o.ok]),
    [["a", true], ["b", false], ["c", true]],
  );
  assert.match(outcomes[1].message, /上传失败：b/);
});

test("已成功的行被跳过——续传不重复上传", async () => {
  const transport = fakeTransport();
  const done = new Map([["a", { mediaId: "med_a", imageSetId: "imgset_a" }]]);
  const outcomes = await runUploads(tasks("a", "b"), transport, { done, concurrency: 1 });
  assert.deepEqual(transport.seen, ["b"]);
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].portrait.mediaId, "med_a");
});

test("进度回调报告总数、完成数与失败数", async () => {
  const snapshots = [];
  await runUploads(tasks("a", "b", "c"), fakeTransport({ c: "fail" }), {
    concurrency: 1,
    onProgress: (progress) => snapshots.push(progress),
  });
  const last = snapshots.at(-1);
  assert.equal(last.total, 3);
  assert.equal(last.completed, 2);
  assert.equal(last.failed, 1);
  assert.deepEqual(last.inFlight, []);
});

test("并发上限被遵守", async () => {
  let peak = 0;
  let active = 0;
  const transport = {
    async upload() {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { mediaId: "m", imageSetId: "i" };
    },
  };
  await runUploads(tasks("a", "b", "c", "d", "e"), transport, { concurrency: 2 });
  assert.equal(peak <= 2, true, `峰值并发 ${peak}`);
});

test("succeededPortraits 只收成功的行，可直接作为下一轮的 done", async () => {
  const outcomes = await runUploads(tasks("a", "b"), fakeTransport({ b: "fail" }), {
    concurrency: 1,
  });
  const done = succeededPortraits(outcomes);
  assert.deepEqual([...done.keys()], ["a"]);
});

// --- 结果清单导出 ---

const OWNER = "pu_9f21c8";

const RESULT_ROWS = [
  {
    row_key: "001_luna",
    operation: "create",
    status: "published",
    character_id: "char_abc",
    work_id: "work_abc",
    review_id: null,
    version_number: 1,
    error_code: null,
    error_message: null,
  },
  {
    row_key: "002_kai",
    operation: "update",
    status: "failed",
    character_id: null,
    work_id: null,
    review_id: null,
    version_number: null,
    error_code: "revision_conflict",
    error_message: "该角色在预检后被修改过，请重新预检",
  },
];

test("结果清单的列固定且不含任何正文字段", () => {
  // 这条是隐私边界的回归测试：导入是写入口，不能顺带变成正文读出口。
  const forbidden = [
    "intro",
    "opening_scene",
    "character_settings",
    "example_dialogues",
    "response_rules",
    "display_name",
  ];
  for (const column of forbidden) {
    assert.equal(RESULT_COLUMNS.includes(column), false, column);
  }
  const [header] = parseCsv(buildResultManifest(RESULT_ROWS, OWNER));
  assert.deepEqual(header.fields, [...RESULT_COLUMNS]);
});

test("结果清单能被自己读回来，null 输出为空", () => {
  const records = parseCsv(buildResultManifest(RESULT_ROWS, OWNER));
  assert.equal(records.length, 3);
  assert.deepEqual(records[1].fields, [
    "001_luna",
    "char_abc",
    "pu_9f21c8",
    "create",
    "published",
    "",
    "",
  ]);
  // 错误说明里的逗号不会把列冲散。
  assert.equal(records[2].fields.length, RESULT_COLUMNS.length);
  assert.equal(records[2].fields[6], "该角色在预检后被修改过，请重新预检");
});

test("导出文件名带批次标识", () => {
  assert.equal(
    resultManifestFilename({ batch_id: "0f3d1a2b3c4d5e6f" }),
    "plum_import_result_0f3d1a2b3c4d.csv",
  );
});

test("汇总把待复核算作成功侧，不计入失败", () => {
  const summary = summarize([
    ...RESULT_ROWS,
    { ...RESULT_ROWS[0], row_key: "003", status: "pending_review" },
    { ...RESULT_ROWS[0], row_key: "004", status: "rejected" },
  ]);
  assert.deepEqual(summary, { published: 1, pending_review: 1, rejected: 1, failed: 1 });
});

// --- 裁剪兜底 ---

test("留空裁剪按目标比例居中，而不是整张图", () => {
  // 契约要求两个裁剪都必填，兜底值直接决定运营留空时立绘会不会变形。
  const wide = centerCrop(9 / 16, 1600, 900);
  assert.equal(wide.height, 1);
  assert.ok(Math.abs(wide.width - (9 / 16) * 900 / 1600) < 1e-9);
  assert.ok(Math.abs(wide.x - (1 - wide.width) / 2) < 1e-9);

  const tall = centerCrop(9 / 16, 900, 1600);
  assert.equal(tall.width, 1);
  assert.ok(Math.abs(tall.height - 900 / (9 / 16) / 1600) < 1e-9);

  // 正方形头像裁在正方形图上就是整张。
  const square = centerCrop(1, 512, 512);
  assert.deepEqual(
    [square.x, square.y, square.width, square.height],
    [0, 0, 1, 1],
  );
  assert.equal(square.contract_version, 2);
});

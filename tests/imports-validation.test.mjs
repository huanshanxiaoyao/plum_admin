import assert from "node:assert/strict";
import test from "node:test";
import {
  hasBlockingIssue,
  parseManifestText,
  validateManifestRows,
  validatePackageStructure,
} from "../features/imports/local-validation.ts";
import { MAX_ROWS_PER_PACKAGE } from "../features/imports/manifest-schema.ts";
import { formatCsv } from "../features/imports/csv.ts";

function entry(path, overrides = {}) {
  return {
    path,
    isDirectory: path.endsWith("/"),
    compressedSize: 100,
    uncompressedSize: overrides.size ?? 100,
    compressionMethod: 8,
    crc32: 0,
    encrypted: false,
    utf8Name: overrides.utf8Name ?? true,
    nonAsciiName: overrides.nonAsciiName ?? false,
    localHeaderOffset: 0,
  };
}

function codes(issues, severity) {
  return issues.filter((issue) => !severity || issue.severity === severity).map((issue) => issue.code);
}

const HEADER = [
  "row_key",
  "display_name",
  "gender",
  "intro",
  "opening_scene",
  "character_settings",
  "creator_declared_rating",
  "portrait_file",
];

function csv(rows) {
  return formatCsv([HEADER, ...rows]);
}

function goodRow(key = "001_luna") {
  return [key, "Luna", "female", "简介", "开场", "设定", "general", `images/${key}.png`];
}

function imagesFor(...keys) {
  return new Map(keys.map((key) => [`images/${key}.png`, 1024]));
}

// --- 包结构 ---

test("合法的包结构被接受", () => {
  const result = validatePackageStructure([
    entry("manifest.csv"),
    entry("images/"),
    entry("images/001_luna.png"),
  ]);
  assert.equal(hasBlockingIssue(result.issues), false);
  assert.equal(result.structure.manifestFormat, "csv");
  assert.deepEqual([...result.structure.images.keys()], ["images/001_luna.png"]);
});

test("jsonl 也被识别", () => {
  const result = validatePackageStructure([entry("manifest.jsonl")]);
  assert.equal(result.structure.manifestFormat, "jsonl");
});

test("xlsx 给出指向另存为 CSV 的错误，而不是笼统的格式不支持", () => {
  const result = validatePackageStructure([entry("manifest.xlsx")]);
  const issue = result.issues.find((item) => item.code === "manifest_format_unsupported");
  assert.ok(issue);
  assert.match(issue.message, /另存为/);
});

test("macOS 压缩塞的系统文件按提示忽略，不阻塞导入", () => {
  const result = validatePackageStructure([
    entry("manifest.csv"),
    entry("__MACOSX/"),
    entry("__MACOSX/._manifest.csv"),
    entry("images/.DS_Store"),
  ]);
  assert.equal(hasBlockingIssue(result.issues), false);
  assert.deepEqual(codes(result.issues, "notice"), ["os_artifacts_ignored"]);
});

test("多余的文件与文件夹被拒绝", () => {
  const result = validatePackageStructure([
    entry("manifest.csv"),
    entry("readme.txt"),
    entry("drafts/"),
  ]);
  assert.deepEqual(codes(result.issues, "error").sort(), ["unexpected_directory", "unexpected_file"]);
});

test("缺少 manifest 直接判定失败", () => {
  const result = validatePackageStructure([entry("images/001.png")]);
  assert.equal(result.structure, undefined);
  assert.deepEqual(codes(result.issues, "error"), ["manifest_missing"]);
});

test("同时存在两个 manifest 时不猜，直接报错", () => {
  const result = validatePackageStructure([entry("manifest.csv"), entry("manifest.jsonl")]);
  assert.equal(result.structure, undefined);
  assert.deepEqual(codes(result.issues, "error"), ["manifest_ambiguous"]);
});

test("图片大小与格式在不解压的情况下就能判定", () => {
  const result = validatePackageStructure([
    entry("manifest.csv"),
    entry("images/big.png", { size: 9 * 1024 * 1024 }),
    entry("images/bad.gif"),
  ]);
  assert.deepEqual(codes(result.issues, "error").sort(), ["image_format_unsupported", "image_too_large"]);
});

test("非 UTF-8 的文件名被拦下，不拿乱码路径去比对", () => {
  const result = validatePackageStructure([
    entry("manifest.csv"),
    entry("images/????.png", { utf8Name: false, nonAsciiName: true }),
  ]);
  assert.deepEqual(codes(result.issues, "error"), ["filename_not_utf8"]);
});

// --- manifest 解析 ---

test("CSV 表头与数据行解析成键值对", () => {
  const parsed = parseManifestText(csv([goodRow()]), "csv");
  assert.deepEqual(parsed.columns, HEADER);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].values.display_name, "Luna");
  assert.equal(parsed.rows[0].line, 2);
});

test("列数与表头不符的行被单独报错，不影响其他行", () => {
  const text = `${formatCsv([HEADER, goodRow("001")])}002,少了几列\r\n${formatCsv([goodRow("003")])}`;
  const parsed = parseManifestText(text, "csv");
  assert.deepEqual(codes(parsed.issues, "error"), ["column_count_mismatch"]);
  assert.deepEqual(
    parsed.rows.map((row) => row.values.row_key),
    ["001", "003"],
  );
});

test("未闭合引号作为解析错误返回，而不是抛出去打断整个流程", () => {
  const parsed = parseManifestText(`${formatCsv([HEADER])}001,"未闭合\n`, "csv");
  assert.deepEqual(codes(parsed.issues, "error"), ["csv_unterminated_quote"]);
});

test("JSONL 的数组标签归一成竖线分隔，与 CSV 走同一条校验路径", () => {
  const parsed = parseManifestText(
    JSON.stringify({ row_key: "001", tag_ids: ["tag_romance", "tag_mystery"] }),
    "jsonl",
  );
  assert.equal(parsed.rows[0].values.tag_ids, "tag_romance|tag_mystery");
});

test("JSONL 的非法行与非对象行被逐行报错", () => {
  const parsed = parseManifestText('{"row_key":"001"}\n不是 JSON\n[1,2]\n', "jsonl");
  assert.deepEqual(codes(parsed.issues, "error"), ["jsonl_invalid", "jsonl_not_object"]);
  assert.equal(parsed.rows.length, 1);
});

// --- 行校验 ---

function validateCsv(rows, images, header = HEADER) {
  const parsed = parseManifestText(formatCsv([header, ...rows]), "csv");
  return validateManifestRows(parsed.rows, parsed.columns, { images });
}

test("完全合规的一行没有任何错误", () => {
  const issues = validateCsv([goodRow()], imagesFor("001_luna"));
  assert.equal(hasBlockingIssue(issues), false);
});

test("缺少必填列被指出", () => {
  const header = HEADER.filter((column) => column !== "intro");
  const row = goodRow().filter((_, index) => index !== HEADER.indexOf("intro"));
  const issues = validateCsv([row], imagesFor("001_luna"), header);
  assert.ok(issues.some((issue) => issue.code === "column_missing" && issue.column === "intro"));
});

test("不认识的列与系统保留列都报错，不静默忽略", () => {
  const header = [...HEADER, "nickname", "status", "moderation_state"];
  const row = [...goodRow(), "小月", "published", "approved"];
  const issues = validateCsv([row], imagesFor("001_luna"), header);
  assert.deepEqual(
    issues.filter((issue) => issue.code.startsWith("column_")).map((issue) => [issue.code, issue.column]),
    [
      ["column_unknown", "nickname"],
      ["column_forbidden", "status"],
      ["column_forbidden", "moderation_state"],
    ],
  );
});

test("row_key 重复时指出两行的行号", () => {
  const issues = validateCsv([goodRow("dup"), goodRow("dup")], imagesFor("dup"));
  const issue = issues.find((item) => item.code === "row_key_duplicated");
  assert.ok(issue);
  assert.match(issue.message, /第 2 行和第 3 行/);
});

test("枚举值只接受约定的取值", () => {
  const row = goodRow();
  row[HEADER.indexOf("gender")] = "男";
  const issues = validateCsv([row], imagesFor("001_luna"));
  const issue = issues.find((item) => item.code === "value_not_allowed");
  assert.equal(issue.column, "gender");
  assert.match(issue.message, /male \/ female \/ non_binary/);
});

test("超出字符上限被指出，并给出当前长度", () => {
  const row = goodRow();
  row[HEADER.indexOf("display_name")] = "名".repeat(51);
  const issues = validateCsv([row], imagesFor("001_luna"));
  const issue = issues.find((item) => item.code === "value_too_long");
  assert.equal(issue.column, "display_name");
  assert.match(issue.message, /当前 51/);
});

test("新增角色缺立绘报错，更新角色缺立绘是合法的", () => {
  const header = [...HEADER, "character_id"];
  const create = [...goodRow("001"), ""];
  create[HEADER.indexOf("portrait_file")] = "";
  const update = [...goodRow("002"), "char_abc"];
  update[HEADER.indexOf("portrait_file")] = "";

  const issues = validateCsv([create, update], new Map(), header);
  const portraitIssues = issues.filter((issue) => issue.code === "portrait_required");
  assert.equal(portraitIssues.length, 1);
  assert.equal(portraitIssues[0].rowKey, "001");
});

test("表格引用了包里没有的图片时报错", () => {
  const issues = validateCsv([goodRow("001_luna")], imagesFor("002_kai"));
  const issue = issues.find((item) => item.code === "portrait_not_found");
  assert.ok(issue);
  assert.match(issue.message, /大小写/);
});

test("没有被引用的图片按提示报出，不阻塞导入", () => {
  const issues = validateCsv([goodRow("001_luna")], imagesFor("001_luna", "002_kai"));
  assert.equal(hasBlockingIssue(issues), false);
  assert.deepEqual(codes(issues, "notice"), ["image_unreferenced"]);
});

test("标签的数量、重复与空值都被校验", () => {
  const header = [...HEADER, "tag_ids"];
  const tooMany = [...goodRow("001"), Array.from({ length: 11 }, (_, i) => `tag_${i}`).join("|")];
  const duplicated = [...goodRow("002"), "tag_a|tag_a"];
  const empty = [...goodRow("003"), "tag_a||tag_b"];
  const issues = validateCsv([tooMany, duplicated, empty], imagesFor("001", "002", "003"), header);
  assert.deepEqual(
    issues.filter((issue) => issue.code.startsWith("tag_")).map((issue) => issue.code),
    ["tag_too_many", "tag_duplicated", "tag_empty"],
  );
});

test("裁剪参数超出图片边界被拒绝", () => {
  const header = [...HEADER, "portrait_crop"];
  const ok = [...goodRow("001"), "0.1,0,0.8,1"];
  const overflow = [...goodRow("002"), "0.5,0,0.8,1"];
  const malformed = [...goodRow("003"), "居中"];
  const issues = validateCsv([ok, overflow, malformed], imagesFor("001", "002", "003"), header);
  const cropIssues = issues.filter((issue) => issue.code === "crop_invalid");
  assert.deepEqual(
    cropIssues.map((issue) => issue.rowKey),
    ["002", "003"],
  );
});

test("超过单包上限时报错并给出实际数量", () => {
  const rows = Array.from({ length: MAX_ROWS_PER_PACKAGE + 1 }, (_, index) => goodRow(`row_${index}`));
  const images = imagesFor(...rows.map((row) => row[0]));
  const issues = validateCsv(rows, images);
  const issue = issues.find((item) => item.code === "too_many_rows");
  assert.ok(issue);
  assert.match(issue.message, new RegExp(`${MAX_ROWS_PER_PACKAGE + 1} 个`));
});

test("每条错误都能定位到行号或列名", () => {
  const row = goodRow();
  row[HEADER.indexOf("gender")] = "男";
  row[HEADER.indexOf("creator_declared_rating")] = "";
  const issues = validateCsv([row], new Map());
  for (const issue of issues.filter((item) => item.severity === "error")) {
    assert.ok(
      issue.line !== undefined || issue.column !== undefined || issue.path !== undefined,
      `${issue.code} 缺少定位信息`,
    );
  }
});

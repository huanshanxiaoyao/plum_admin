import assert from "node:assert/strict";
import test from "node:test";
import { CsvParseError, formatCsv, parseCsv } from "../features/imports/csv.ts";

function fields(text) {
  return parseCsv(text).map((record) => record.fields);
}

test("解析基础的逗号分隔行", () => {
  assert.deepEqual(fields("a,b,c\n1,2,3\n"), [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("引号内的逗号、换行和双引号都按字面量保留", () => {
  const text = 'name,intro\r\n"Luna","她说：""你好，世界""\r\n下一行"\r\n';
  assert.deepEqual(fields(text), [
    ["name", "intro"],
    ["Luna", '她说："你好，世界"\r\n下一行'],
  ]);
});

test("三种换行都能解析", () => {
  assert.deepEqual(fields("a\r\nb\rc\nd"), [["a"], ["b"], ["c"], ["d"]]);
});

test("剥掉 Excel 导出的 BOM，否则第一个列名会带上不可见字符", () => {
  const records = parseCsv("﻿row_key,display_name\n001,Luna\n");
  assert.equal(records[0].fields[0], "row_key");
});

test("空行保留为单个空字段，不压缩行号", () => {
  const records = parseCsv("a\n\nb\n");
  assert.deepEqual(
    records.map((record) => [record.line, record.fields]),
    [
      [1, ["a"]],
      [2, [""]],
      [3, ["b"]],
    ],
  );
});

test("引号内的换行不推进记录行号，但会推进后续记录的行号", () => {
  // 报错定位全靠行号：跨行字段之后如果行号不跟着走，后面每一行的报错都会指错地方。
  const records = parseCsv('a\n"多\n行\n内容"\nz\n');
  assert.deepEqual(
    records.map((record) => record.line),
    [1, 2, 5],
  );
  assert.equal(records[1].fields[0], "多\n行\n内容");
});

test("文件以换行结尾时不产出多余的空记录", () => {
  assert.equal(parseCsv("a,b\n").length, 1);
  assert.equal(parseCsv("a,b").length, 1);
});

test("未闭合的引号抛出带行号的错误", () => {
  assert.throws(
    () => parseCsv('a\nb,"未闭合\n'),
    (caught) => {
      assert.ok(caught instanceof CsvParseError);
      assert.equal(caught.code, "csv_unterminated_quote");
      assert.equal(caught.line, 2);
      return true;
    },
  );
});

test("引号闭合后紧跟字符时按字面量续接，不为此拒绝整个包", () => {
  assert.deepEqual(fields('"a"b,c'), [["ab", "c"]]);
});

test("拼装时只给需要的字段加引号", () => {
  assert.equal(formatCsv([["a", "b,c", 'd"e', "f\ng", " h "]]), 'a,"b,c","d""e","f\ng"," h "\r\n');
});

test("空数组不产出内容", () => {
  assert.equal(formatCsv([]), "");
});

test("BOM 只在明确要求时加", () => {
  assert.equal(formatCsv([["a"]]).startsWith("﻿"), false);
  assert.equal(formatCsv([["a"]], { bom: true }).startsWith("﻿"), true);
});

test("解析与拼装可往返：导出的结果清单必须能被自己读回来", () => {
  const rows = [
    ["row_key", "character_id", "error_message"],
    ["001_luna", "char_abc", "归属账号不存在，请核对"],
    ["002_kai", "", '第 3 行有逗号,和"引号"'],
    ["003_mei", "char_def", "多行\n错误\r\n说明"],
    ["004_ivy", "", " 前后有空格 "],
    ["005_zed", "", ""],
  ];
  assert.deepEqual(fields(formatCsv(rows)), rows);
  assert.deepEqual(fields(formatCsv(rows, { bom: true })), rows);
});

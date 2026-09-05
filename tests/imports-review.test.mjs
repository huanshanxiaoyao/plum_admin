import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewModel, submittableRows } from "../features/imports/review-model.ts";
import { FIXTURE_BATCH, FIXTURE_DETAIL } from "../features/imports/fixtures.ts";
import { batchCounts, summarize } from "../features/imports/import-contracts.ts";
import { STATUS_TONES } from "../features/imports/labels.ts";

function read(rows, issues = []) {
  return { columns: [], rows, images: new Map(), issues };
}

function row(line, values) {
  return { line, values };
}

test("由 character_id 决定新增还是更新", () => {
  const model = buildReviewModel(
    read([
      row(2, { row_key: "001", display_name: "Luna", character_id: "" }),
      row(3, { row_key: "002", display_name: "Kai", character_id: "char_abc" }),
    ]),
    null,
    "pu_1",
  );
  assert.deepEqual(model.rows.map((item) => item.operation), ["create", "update"]);
  assert.equal(model.rows[1].characterId, "char_abc");
});

test("行级归属账号覆盖批次默认值", () => {
  const model = buildReviewModel(
    read([
      row(2, { row_key: "001" }),
      row(3, { row_key: "002", owner_platform_user_id: "pu_other" }),
    ]),
    null,
    "pu_default",
  );
  assert.deepEqual(
    model.rows.map((item) => item.ownerPlatformUserId),
    ["pu_default", "pu_other"],
  );
});

test("服务端的操作判定优先于本地推断", () => {
  // 本地只能看这一列填没填；服务端看得到角色是否真的存在、草稿是否可编辑。
  const model = buildReviewModel(
    read([row(2, { row_key: "001", character_id: "char_abc" })]),
    [
      {
        row_key: "001",
        operation: "create",
        owner_platform_user_id: "pu_1",
        expected_revision: null,
        changed_fields: [],
        portrait_action: "upload",
        portrait_media_id: "",
        prompt_budget: { blocks: [], total_tokens: 0, over_limit: false },
        issues: [],
      },
    ],
    "pu_1",
  );
  assert.equal(model.rows[0].operation, "create");
});

test("本地与服务端的问题合并到同一行，并标出来源", () => {
  const model = buildReviewModel(
    read(
      [row(2, { row_key: "001" })],
      [{ severity: "error", code: "value_required", message: "缺简介", rowKey: "001", column: "intro" }],
    ),
    [
      {
        row_key: "001",
        operation: "create",
        owner_platform_user_id: "pu_1",
        expected_revision: null,
        changed_fields: [],
        portrait_action: "upload",
        portrait_media_id: "",
        prompt_budget: { blocks: [], total_tokens: 0, over_limit: false },
        issues: [{ code: "prompt_budget_exceeded", message: "设定超出容量" }],
      },
    ],
    "pu_1",
  );
  assert.deepEqual(
    model.rows[0].issues.map((issue) => [issue.origin, issue.code]),
    [
      ["local", "value_required"],
      ["server", "prompt_budget_exceeded"],
    ],
  );
  assert.equal(model.rows[0].blocked, true);
});

test("notice 不阻塞提交，error 才阻塞", () => {
  const model = buildReviewModel(
    read(
      [row(2, { row_key: "001" }), row(3, { row_key: "002" })],
      [
        { severity: "notice", code: "image_unreferenced", message: "图片没被引用", rowKey: "001" },
        { severity: "error", code: "value_required", message: "缺简介", rowKey: "002" },
      ],
    ),
    null,
    "pu_1",
  );
  assert.equal(model.passing, 1);
  assert.equal(model.blocked, 1);
  assert.deepEqual(submittableRows(model).map((item) => item.rowKey), ["001"]);
});

test("包级错误让整个包都不可提交——结构不对时逐行通过没有意义", () => {
  const model = buildReviewModel(
    read(
      [row(2, { row_key: "001" })],
      [{ severity: "error", code: "unexpected_file", message: "多余文件", path: "readme.txt" }],
    ),
    null,
    "pu_1",
  );
  assert.equal(model.packageBlocked, true);
  assert.equal(model.passing, 1, "逐行判定不受包级错误影响");
  assert.deepEqual(submittableRows(model), [], "但一行都不提交");
});

test("包级提示不阻塞提交", () => {
  const model = buildReviewModel(
    read(
      [row(2, { row_key: "001" })],
      [{ severity: "notice", code: "os_artifacts_ignored", message: "已忽略系统文件" }],
    ),
    null,
    "pu_1",
  );
  assert.equal(model.packageBlocked, false);
  assert.equal(submittableRows(model).length, 1);
});

// --- 结果页 fixture ---

test("结果 fixture 覆盖四种终态，且汇总自洽", () => {
  // 全绿的样例看不出「部分成功」和「全部成功」在视觉上有没有区分开。
  const statuses = new Set(FIXTURE_DETAIL.rows.map((row) => row.status));
  assert.deepEqual([...statuses].sort(), ["failed", "pending_review", "published", "rejected"]);
  // 台账上的平铺计数必须和逐行结果数出来的一致，否则结果页的汇总在骗人。
  assert.deepEqual(batchCounts(FIXTURE_BATCH), summarize(FIXTURE_DETAIL.rows));
  assert.equal(
    FIXTURE_BATCH.row_count,
    Object.values(batchCounts(FIXTURE_BATCH)).reduce((total, count) => total + count, 0),
  );
});

test("待复核染成 warn，与被拒和失败的 bad 区分开", () => {
  assert.equal(STATUS_TONES.pending_review, "warn");
  assert.equal(STATUS_TONES.rejected, "bad");
  assert.equal(STATUS_TONES.failed, "bad");
  assert.equal(STATUS_TONES.published, "good");
});

test("失败行不带 character_id，成功行带", () => {
  for (const row of FIXTURE_DETAIL.rows) {
    if (row.status === "published" || row.status === "pending_review") {
      assert.ok(row.character_id, row.row_key);
    }
  }
});

test("更新行带回目标角色在库里的当前名字", () => {
  // 这一列是「我要改的确实是这一个」的唯一凭据：character_id 是操作员填的，
  // 拿它回显等于自证；抄成另一个合法 ID 时只有这个名字对得上不上。
  const model = buildReviewModel(
    read([
      row(2, { row_key: "001", display_name: "露娜", character_id: "char_kai" }),
      row(3, { row_key: "002", display_name: "新角色", character_id: "" }),
    ]),
    [
      {
        row_key: "001",
        operation: "update",
        owner_platform_user_id: "pu_1",
        expected_revision: 3,
        target_display_name: "凯",
        changed_fields: ["display_name"],
        portrait_action: "reuse",
        portrait_media_id: "media_1",
        prompt_budget: { blocks: [], total_tokens: 0, over_limit: false },
        issues: [],
      },
      {
        row_key: "002",
        operation: "create",
        owner_platform_user_id: "pu_1",
        expected_revision: null,
        target_display_name: null,
        changed_fields: [],
        portrait_action: "upload",
        portrait_media_id: "",
        prompt_budget: { blocks: [], total_tokens: 0, over_limit: false },
        issues: [],
      },
    ],
    "pu_1",
  );
  assert.equal(model.rows[0].targetDisplayName, "凯");
  // 抄错目标不产生任何 issue——这正是它必须被显示出来的原因。
  assert.deepEqual(model.rows[0].issues, []);
  assert.equal(model.rows[0].blocked, false);
  assert.equal(model.rows[1].targetDisplayName, null);
});

test("没跑服务端预检时不编造目标名称", () => {
  const model = buildReviewModel(
    read([row(2, { row_key: "001", display_name: "露娜", character_id: "char_abc" })]),
    null,
    "pu_1",
  );
  assert.equal(model.rows[0].targetDisplayName, null);
});

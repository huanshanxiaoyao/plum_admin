import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_BATCHES, fixtureBatch, fixtureBatchPage } from "../features/imports/fixtures.ts";
import { batchCounts } from "../features/imports/import-contracts.ts";
import {
  BATCHES_PER_PAGE,
  historyHref,
  normalizeLimit,
  normalizeOffset,
} from "../features/imports/history-paging.ts";

test("台账里的每一批都能点进详情", () => {
  // 台账唯一的用处就是「跑完一批、关掉页面，还能找回那次结果」。
  // 列出来却点不进去，等于没做——这一条挡的就是那种半成品。
  for (const batch of FIXTURE_BATCHES) {
    const detail = fixtureBatch(batch.batch_id);
    assert.ok(detail, `批次 ${batch.batch_id} 在台账里，却打不开详情`);
    assert.equal(detail.batch.batch_id, batch.batch_id);
  }
});

test("台账按时间倒序，最新的在最前", () => {
  const times = FIXTURE_BATCHES.map((batch) => Date.parse(batch.created_at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

test("进行中的批次计数不齐，已完成的必须齐", () => {
  for (const batch of FIXTURE_BATCHES) {
    const counts = batchCounts(batch);
    const settled = counts.published + counts.pending_review + counts.rejected + counts.failed;
    if (batch.status === "completed") {
      assert.equal(settled, batch.row_count, `已完成的 ${batch.batch_id} 少算了行`);
    } else {
      assert.ok(settled <= batch.row_count);
    }
  }
});

test("按 limit / offset 切页，不是游标", () => {
  const first = fixtureBatchPage(2, 0);
  const second = fixtureBatchPage(2, 2);
  assert.equal(first.length, 2);
  assert.deepEqual(
    [...first, ...second].map((batch) => batch.batch_id),
    FIXTURE_BATCHES.map((batch) => batch.batch_id),
  );
  assert.deepEqual(fixtureBatchPage(2, FIXTURE_BATCHES.length), []);
});

test("手敲的 offset 一律先归一化再发给后端", () => {
  // 这些值都能出现在地址栏里。负数或 NaN 直接透传给后端就是 422 或整页 500。
  assert.equal(normalizeOffset("-20"), 0);
  assert.equal(normalizeOffset("abc"), 0);
  assert.equal(normalizeOffset(undefined), 0);
  assert.equal(normalizeOffset("1.5"), 1);
  assert.equal(normalizeOffset("40"), 40);
  assert.equal(normalizeOffset("999999999"), 10_000);
  assert.equal(normalizeLimit("0"), 1);
  assert.equal(normalizeLimit("9999"), 200);
  assert.equal(normalizeLimit(undefined), BATCHES_PER_PAGE);
});

test("上一页越过第一页时回到不带 offset 的地址", () => {
  assert.equal(historyHref(0), "/imports/batches");
  assert.equal(historyHref(-20), "/imports/batches");
  assert.equal(historyHref(BATCHES_PER_PAGE), "/imports/batches?offset=20");
});

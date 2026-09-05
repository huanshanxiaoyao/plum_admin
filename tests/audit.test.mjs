import assert from "node:assert/strict";
import test from "node:test";
import {
  containsForbiddenMetadata,
  isAuditEvent,
  normalizeAuditQuery,
  parseAuditEventListResponse,
} from "../features/audit/audit-contracts.ts";
import { fixtureAuditEvents } from "../features/audit/fixtures.ts";
import { ACTION_LABELS, FILTERABLE_ACTIONS, actionLabel, resourceLabel } from "../features/audit/labels.ts";
import { adminModuleForSection, visibleAdminModules } from "../features/admin-navigation/modules.ts";
import { requiredCapability } from "../lib/bff/allowlist.ts";
import { capabilitiesForRole } from "../lib/auth/capabilities.ts";

const EVENT = {
  id: "10241",
  occurred_at: "2026-09-05T02:16:02.000Z",
  actor_open_id: "ou_71ef6b6652b488fb",
  actor_display_name: "林运营",
  action: "plum.character.revise",
  resource_type: "plum_character_import_row",
  resource_id: "batch:003_mei",
  plaintext: false,
  reason: "2026-09 角色补充第一批",
  request_path: "/admin/plum/imports/characters",
  metadata: { batch_id: "batch", changed_fields: ["display_name"] },
};

function listResponse(data) {
  return {
    data,
    page: { limit: 50, next_cursor: null, has_more: false },
    meta: { request_id: "req_1" },
  };
}

test("管理员能读审计，运营读不到——两条路径都要挡住", () => {
  // 页面入口
  assert.equal(adminModuleForSection("audit")?.capability, "audit.read");
  const sections = (role) =>
    visibleAdminModules("remote", capabilitiesForRole(role)).map((module) => module.key);
  assert.ok(sections("admin").includes("audit"));
  assert.ok(!sections("operator").includes("audit"));
  // BFF 转发。入口藏起来但接口放行，等于没做权限。
  assert.equal(requiredCapability("GET", "audit-events"), "audit.read");
  assert.ok(!capabilitiesForRole("operator").includes("audit.read"));
});

test("审计页在远端模式也可见——它存在的理由就是回看线上发生过什么", () => {
  // 之前这一页是 fixture 档，生产上根本打不开：写开关放开之后这不成立。
  const keys = visibleAdminModules("remote", capabilitiesForRole("admin")).map((m) => m.key);
  assert.ok(keys.includes("audit"));
});

test("正文类字段一旦出现在 metadata 里，整行拒绝而不是照常渲染", () => {
  // 真漏了是写入侧的 bug，得在写入侧修；前端这道闸门是让它立刻可见。
  for (const key of ["prompt", "content", "opening_scene", "character_settings", "access_token", "cookie"]) {
    assert.equal(containsForbiddenMetadata({ [key]: "x" }), true, key);
    assert.equal(isAuditEvent({ ...EVENT, metadata: { [key]: "x" } }), false, key);
    assert.throws(
      () => parseAuditEventListResponse(listResponse([{ ...EVENT, metadata: { [key]: "x" } }])),
      TypeError,
      key,
    );
  }
});

test("合法的一行能通过解析，缺字段的不能", () => {
  assert.equal(isAuditEvent(EVENT), true);
  assert.deepEqual(parseAuditEventListResponse(listResponse([EVENT])).data, [EVENT]);
  for (const missing of ["id", "occurred_at", "actor_open_id", "action", "resource_type", "plaintext"]) {
    const broken = { ...EVENT };
    delete broken[missing];
    assert.equal(isAuditEvent(broken), false, missing);
  }
});

test("已注销的操作者没有人名，但这条审计仍然读得出来", () => {
  // 人可能被删号或换过租户；那种情况下账本更不能断。
  assert.equal(isAuditEvent({ ...EVENT, actor_display_name: null }), true);
  assert.equal(isAuditEvent({ ...EVENT, reason: null, request_path: null, resource_id: null }), true);
});

test("信封形状不对就抛，不允许渲染半份账本", () => {
  assert.throws(() => parseAuditEventListResponse({ data: [EVENT] }), TypeError);
  assert.throws(() => parseAuditEventListResponse(listResponse(EVENT)), TypeError);
  assert.throws(
    () => parseAuditEventListResponse({ ...listResponse([EVENT]), page: { limit: 50 } }),
    TypeError,
  );
  assert.throws(() => parseAuditEventListResponse({ ...listResponse([EVENT]), meta: {} }), TypeError);
});

test("手敲的 action 筛选降级成不筛选，而不是把整页变成 400", () => {
  // 后端按 plum. / plum_moderation. 前缀校验，随便传会 400。
  assert.equal(normalizeAuditQuery({ action: "admin.plaintext_read" }).action, undefined);
  assert.equal(normalizeAuditQuery({ action: "plum.character.made_up" }).action, undefined);
  assert.equal(normalizeAuditQuery({ action: "plum_moderation.purge" }).action, "plum_moderation.purge");
});

test("limit 与 actor 一律先归一化再发给后端", () => {
  assert.equal(normalizeAuditQuery({}).limit, 50);
  assert.equal(normalizeAuditQuery({ limit: 0 }).limit, 1);
  assert.equal(normalizeAuditQuery({ limit: 9999 }).limit, 200);
  assert.equal(normalizeAuditQuery({ limit: 1.5 }).limit, 50);
  assert.equal(normalizeAuditQuery({ actor: "  ou_1  " }).actor, "ou_1");
  assert.equal(normalizeAuditQuery({ actor: "   " }).actor, undefined);
  assert.equal(normalizeAuditQuery({ plaintext: true }).plaintext, true);
  assert.equal(normalizeAuditQuery({ plaintext: undefined }).plaintext, undefined);
});

test("可筛动作都有中文名，且都在后端认的两个前缀里", () => {
  for (const action of FILTERABLE_ACTIONS) {
    assert.notEqual(actionLabel(action), action, `${action} 缺中文名`);
    assert.ok(
      action.startsWith("plum.") || action.startsWith("plum_moderation."),
      `${action} 会被后端按前缀拒掉`,
    );
  }
  // 未知动作原样显示：新增审计动作时列表照常出现，只是暂时没有中文名。
  assert.equal(actionLabel("plum.character.brand_new"), "plum.character.brand_new");
  assert.equal(resourceLabel("plum_unknown_thing"), "plum_unknown_thing");
});

test("fixture 覆盖导入与复核两类写操作，还有一次明文读取", () => {
  // 只有导入的样例证明不了「共用写开关放开后两类操作都留得下账」。
  const { data } = fixtureAuditEvents({ limit: 50 });
  const actions = new Set(data.map((event) => event.action));
  assert.ok(actions.has("plum.character.import"));
  assert.ok(actions.has("plum_moderation.purge"));
  assert.equal(data.some((event) => event.plaintext), true);
  for (const event of data) {
    assert.equal(isAuditEvent(event), true, event.id);
    assert.ok(event.action in ACTION_LABELS, `${event.action} 没有中文名`);
  }
});

test("fixture 按时间倒序，筛选与翻页都不丢行", () => {
  const { data } = fixtureAuditEvents({ limit: 50 });
  const times = data.map((event) => Date.parse(event.occurred_at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));

  const first = fixtureAuditEvents({ limit: 2 });
  assert.equal(first.page.has_more, true);
  const second = fixtureAuditEvents({ limit: 2, cursor: first.page.next_cursor });
  assert.deepEqual(
    [...first.data, ...second.data].map((event) => event.id),
    data.slice(0, 4).map((event) => event.id),
  );

  assert.ok(
    fixtureAuditEvents({ limit: 50, plaintext: true }).data.every((event) => event.plaintext),
  );
  assert.ok(
    fixtureAuditEvents({ limit: 50, action: "plum_moderation.purge" }).data.every(
      (event) => event.action === "plum_moderation.purge",
    ),
  );
});

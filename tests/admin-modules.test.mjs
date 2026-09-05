import assert from "node:assert/strict";
import test from "node:test";
import { adminModuleForSection, visibleAdminModules } from "../features/admin-navigation/modules.ts";
import { capabilitiesForRole } from "../lib/auth/capabilities.ts";

function keys(mode, role) {
  return visibleAdminModules(mode, capabilitiesForRole(role)).map((module) => module.key);
}

test("remote mode exposes only shipped modules allowed by RBAC", () => {
  assert.deepEqual(keys("remote", "operator"), [
    "dashboard",
    "characters",
    "imports",
    "moderation",
    "creators",
    "users",
  ]);
  assert.deepEqual(keys("remote", "admin"), [
    "dashboard",
    "characters",
    "imports",
    "moderation",
    "creators",
    "users",
    "audit",
    "staff",
  ]);
});

test("fixture mode keeps prototype modules without exposing staff to operators", () => {
  assert.deepEqual(keys("fixture", "operator"), [
    "dashboard",
    "characters",
    "imports",
    "moderation",
    "creators",
    "users",
    "subscriptions",
  ]);
  assert.deepEqual(keys("fixture", "admin"), [
    "dashboard",
    "characters",
    "imports",
    "moderation",
    "creators",
    "users",
    "subscriptions",
    "audit",
    "staff",
  ]);
});

test("section lookup excludes the dashboard and unknown routes", () => {
  assert.equal(adminModuleForSection("staff")?.capability, "staff.manage");
  assert.equal(adminModuleForSection("dashboard"), undefined);
  // 复核队列对 operator 开放：purge 不额外限制 admin 是已拍板的产品决定。
  assert.equal(adminModuleForSection("moderation")?.capability, "operations.access");
  // 批量导入复用同一道闸门，不新开一个 capability。
  assert.equal(adminModuleForSection("imports")?.capability, "operations.access");
  // 审计不共用日常闸门：能看账本的只有 admin。
  assert.equal(adminModuleForSection("audit")?.capability, "audit.read");
  assert.equal(adminModuleForSection("appeals"), undefined);
});

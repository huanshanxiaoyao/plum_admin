import assert from "node:assert/strict";
import test from "node:test";
import { adminModuleForSection, visibleAdminModules } from "../features/admin-navigation/modules.ts";
import { capabilitiesForRole } from "../lib/auth/capabilities.ts";

function keys(mode, role) {
  return visibleAdminModules(mode, capabilitiesForRole(role)).map((module) => module.key);
}

test("remote mode exposes only shipped modules allowed by RBAC", () => {
  assert.deepEqual(keys("remote", "operator"), ["dashboard", "characters", "moderation", "creators", "users"]);
  assert.deepEqual(keys("remote", "admin"), ["dashboard", "characters", "moderation", "creators", "users", "staff"]);
});

test("fixture mode keeps prototype modules without exposing staff to operators", () => {
  assert.deepEqual(keys("fixture", "operator"), [
    "dashboard",
    "characters",
    "moderation",
    "creators",
    "users",
    "subscriptions",
    "audit",
  ]);
  assert.deepEqual(keys("fixture", "admin"), [
    "dashboard",
    "characters",
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
  assert.equal(adminModuleForSection("appeals"), undefined);
});

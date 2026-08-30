import assert from "node:assert/strict";
import test from "node:test";
import { adminModuleForSection, visibleAdminModules } from "../lib/admin/modules.ts";
import { capabilitiesForRole } from "../lib/auth/capabilities.ts";

function keys(mode, role) {
  return visibleAdminModules(mode, capabilitiesForRole(role)).map((module) => module.key);
}

test("remote mode exposes only shipped modules allowed by RBAC", () => {
  assert.deepEqual(keys("remote", "operator"), ["dashboard"]);
  assert.deepEqual(keys("remote", "admin"), ["dashboard", "staff"]);
});

test("fixture mode keeps prototype modules without exposing staff to operators", () => {
  assert.deepEqual(keys("fixture", "operator"), [
    "dashboard",
    "characters",
    "creators",
    "users",
    "subscriptions",
    "audit",
  ]);
  assert.deepEqual(keys("fixture", "admin"), [
    "dashboard",
    "characters",
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
  assert.equal(adminModuleForSection("moderation"), undefined);
});

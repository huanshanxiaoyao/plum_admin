import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITIES,
  capabilitiesForRole,
  hasCapability,
  isAdminRole,
} from "../lib/auth/capabilities.ts";

test("operator receives only the daily operations capability", () => {
  assert.deepEqual(capabilitiesForRole("operator"), ["operations.access"]);
  assert.equal(hasCapability("operator", "character.restore"), false);
  assert.equal(hasCapability("operator", "membership.manage"), false);
  assert.equal(hasCapability("operator", "staff.manage"), false);
  // 审计是「谁动过什么」的账本，只给 admin。
  assert.equal(hasCapability("operator", "audit.read"), false);
});

test("admin receives every capability, audit read included", () => {
  assert.deepEqual(capabilitiesForRole("admin"), CAPABILITIES);
  assert.equal(hasCapability("admin", "audit.read"), true);
});

test("only the two frozen roles are accepted", () => {
  assert.equal(isAdminRole("operator"), true);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("viewer"), false);
  assert.equal(isAdminRole("reviewer"), false);
});

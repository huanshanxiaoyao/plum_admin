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
});

test("admin receives all four capabilities", () => {
  assert.deepEqual(capabilitiesForRole("admin"), CAPABILITIES);
});

test("only the two frozen roles are accepted", () => {
  assert.equal(isAdminRole("operator"), true);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("viewer"), false);
  assert.equal(isAdminRole("reviewer"), false);
});

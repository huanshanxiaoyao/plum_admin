import assert from "node:assert/strict";
import test from "node:test";
import { encodeBackendPath, requiredCapability } from "../lib/bff/allowlist.ts";

test("daily routes resolve to operations access", () => {
  assert.equal(requiredCapability("GET", "characters"), "operations.access");
  assert.equal(requiredCapability("POST", "official/works/accept-01/submit"), "operations.access");
  assert.equal(requiredCapability("PATCH", "creators/pusr-01/control"), "operations.access");
});

test("three advanced route groups require admin capabilities", () => {
  assert.equal(requiredCapability("POST", "characters/char-01/restore"), "character.restore");
  assert.equal(requiredCapability("POST", "users/pusr-01/membership/disable"), "membership.manage");
  assert.equal(requiredCapability("GET", "admin-users"), "staff.manage");
  assert.equal(requiredCapability("PATCH", "admin-users/adm-01"), "staff.manage");
});

test("unknown paths and methods remain closed", () => {
  assert.equal(requiredCapability("DELETE", "users/pusr-01"), null);
  assert.equal(requiredCapability("GET", "../../health"), null);
  assert.equal(requiredCapability("POST", "arbitrary/proxy/path"), null);
  assert.equal(requiredCapability("GET", "users/pusr-01/wallet"), null);
  assert.equal(requiredCapability("GET", "moderation/tasks"), null);
  assert.equal(requiredCapability("GET", "tags"), null);
});

test("backend paths reject traversal and encode each accepted segment", () => {
  assert.equal(encodeBackendPath(["characters", "char-01"]), "characters/char-01");
  assert.equal(encodeBackendPath(["characters", "name?#%"]), "characters/name%3F%23%25");
  assert.equal(encodeBackendPath(["characters", "..", "badges", "badge-01"]), null);
  assert.equal(encodeBackendPath(["characters", "char\\badge"]), null);
  assert.equal(encodeBackendPath(["characters", "char/badge"]), null);
});

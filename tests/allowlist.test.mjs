import assert from "node:assert/strict";
import test from "node:test";
import { encodeBackendPath, requiredCapability } from "../lib/bff/allowlist.ts";

test("daily routes resolve to operations access", () => {
  assert.equal(requiredCapability("GET", "characters"), "operations.access");
  assert.equal(requiredCapability("GET", "characters/char-01"), "operations.access");
  assert.equal(requiredCapability("GET", "characters/char-01/versions"), "operations.access");
  assert.equal(requiredCapability("GET", "works/work-01"), "operations.access");
  assert.equal(requiredCapability("GET", "creators/pusr-01"), "operations.access");
  assert.equal(requiredCapability("GET", "users/pusr-01"), "operations.access");
  assert.equal(requiredCapability("GET", "users/pusr-01/wallet"), "operations.access");
  assert.equal(requiredCapability("POST", "users/pusr-01/wallet/grants"), "operations.access");
  assert.equal(requiredCapability("GET", "overview"), "operations.access");
});

test("moderation review queue is readable and decidable by operators", () => {
  assert.equal(requiredCapability("GET", "moderation/reviews"), "operations.access");
  assert.equal(requiredCapability("GET", "moderation/reviews/rev-01"), "operations.access");
  assert.equal(requiredCapability("GET", "moderation/backlog"), "operations.access");
  assert.equal(requiredCapability("POST", "moderation/reviews/rev-01/claim"), "operations.access");
  assert.equal(requiredCapability("POST", "moderation/reviews/rev-01/decision"), "operations.access");
});

test("character import endpoints are reachable by operators", () => {
  assert.equal(requiredCapability("GET", "imports"), "operations.access");
  assert.equal(requiredCapability("GET", "imports/0f3d1a2b"), "operations.access");
  assert.equal(requiredCapability("GET", "imports/characters/schema"), "operations.access");
  assert.equal(requiredCapability("POST", "imports/characters/preflight"), "operations.access");
  assert.equal(requiredCapability("POST", "imports/characters"), "operations.access");
  assert.equal(requiredCapability("POST", "imports/media/uploads"), "operations.access");
  assert.equal(requiredCapability("POST", "imports/media/uploads/med_1/complete"), "operations.access");
  assert.equal(requiredCapability("POST", "imports/media/image-sets"), "operations.access");
  assert.equal(requiredCapability("GET", "imports/media/image-sets/cimg_1"), "operations.access");
});

test("import rules do not widen into neighbouring paths", () => {
  assert.equal(requiredCapability("POST", "imports"), null);
  assert.equal(requiredCapability("DELETE", "imports/0f3d1a2b"), null);
  assert.equal(requiredCapability("GET", "imports/a/b"), null);
  assert.equal(requiredCapability("GET", "imports/media/uploads"), null);
  assert.equal(requiredCapability("GET", "imports/media/image-sets"), null);
  assert.equal(requiredCapability("GET", "imports/media/image-sets/cimg_1/extra"), null);
  assert.equal(requiredCapability("POST", "imports/characters/schema"), null);
  assert.equal(requiredCapability("POST", "imports/media/uploads/med_1"), null);
});

test("moderation rules do not widen into neighbouring paths", () => {
  assert.equal(requiredCapability("POST", "moderation/reviews"), null);
  assert.equal(requiredCapability("POST", "moderation/reviews/rev-01"), null);
  assert.equal(requiredCapability("DELETE", "moderation/reviews/rev-01"), null);
  assert.equal(requiredCapability("GET", "moderation/reviews/rev-01/claim"), null);
  assert.equal(requiredCapability("POST", "moderation/reviews/rev-01/purge"), null);
  assert.equal(requiredCapability("GET", "moderation/reviews/rev-01/content"), null);
  assert.equal(requiredCapability("GET", "moderation"), null);
  assert.equal(requiredCapability("POST", "moderation/backlog"), null);
});

test("audit read stays behind its own capability, and only for GET", () => {
  assert.equal(requiredCapability("GET", "audit-events"), "audit.read");
  assert.equal(requiredCapability("POST", "audit-events"), null);
  assert.equal(requiredCapability("DELETE", "audit-events"), null);
  assert.equal(requiredCapability("GET", "audit-events/10241"), null);
  assert.equal(requiredCapability("GET", "audit"), null);
});

test("staff management stays behind its own capability", () => {
  assert.equal(requiredCapability("GET", "admin-users"), "staff.manage");
  assert.equal(requiredCapability("PATCH", "admin-users/adm-01"), "staff.manage");
});

test("phase-one-excluded and unknown routes remain closed", () => {
  assert.equal(requiredCapability("POST", "official/works/accept-01/submit"), null);
  assert.equal(requiredCapability("POST", "characters/char-01/takedown"), null);
  assert.equal(requiredCapability("POST", "characters/char-01/restore"), null);
  assert.equal(requiredCapability("PATCH", "creators/pusr-01/control"), null);
  assert.equal(requiredCapability("POST", "users/pusr-01/membership/disable"), null);
  assert.equal(requiredCapability("GET", "subscriptions"), null);
  assert.equal(requiredCapability("DELETE", "users/pusr-01"), null);
  assert.equal(requiredCapability("GET", "../../health"), null);
  assert.equal(requiredCapability("POST", "arbitrary/proxy/path"), null);
  assert.equal(requiredCapability("POST", "users/pusr-01/wallet"), null);
  assert.equal(requiredCapability("GET", "users/pusr-01/wallet/grants"), null);
  assert.equal(requiredCapability("POST", "users/pusr-01/wallet/grants/extra"), null);
  assert.equal(requiredCapability("GET", "moderation/tasks"), null);
  assert.equal(requiredCapability("GET", "tags"), null);
  assert.equal(requiredCapability("GET", "works/work-01/content"), null);
});

test("backend paths reject traversal and encode each accepted segment", () => {
  assert.equal(encodeBackendPath(["characters", "char-01"]), "characters/char-01");
  assert.equal(encodeBackendPath(["characters", "name?#%"]), "characters/name%3F%23%25");
  assert.equal(encodeBackendPath(["characters", "..", "badges", "badge-01"]), null);
  assert.equal(encodeBackendPath(["characters", "char\\badge"]), null);
  assert.equal(encodeBackendPath(["characters", "char/badge"]), null);
});

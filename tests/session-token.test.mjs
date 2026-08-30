import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, verifySessionToken } from "../lib/auth/session-token.ts";

const SECRET = "unit-test-session-secret-at-least-32-characters";
const NOW = Date.parse("2026-08-28T04:00:00.000Z");
const OPERATOR = {
  id: "adm_accept_operator",
  email: "operator@plum-admin.invalid",
  displayName: "Acceptance Operator",
  role: "operator",
};

test("signed session round-trips and derives capabilities from role", async () => {
  const token = await createSessionToken(OPERATOR, SECRET, NOW);
  const identity = await verifySessionToken(token, SECRET, NOW + 1000);
  assert.deepEqual(identity, {
    ...OPERATOR,
    capabilities: ["operations.access"],
  });
});

test("tampered and expired sessions are rejected", async () => {
  const token = await createSessionToken(OPERATOR, SECRET, NOW);
  assert.equal(await verifySessionToken(`${token}x`, SECRET, NOW + 1000), null);
  assert.equal(await verifySessionToken(token, SECRET, NOW + 8 * 60 * 60 * 1000), null);
});

test("session accepts a Feishu identity without email", async () => {
  const identity = { ...OPERATOR, id: "ou_feishu_operator", email: "" };
  const token = await createSessionToken(identity, SECRET, NOW);
  assert.deepEqual(await verifySessionToken(token, SECRET, NOW + 1000), {
    ...identity,
    capabilities: ["operations.access"],
  });
});

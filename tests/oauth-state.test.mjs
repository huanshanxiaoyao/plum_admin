import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeniedIdentityToken,
  createOAuthTransaction,
  verifyDeniedIdentityToken,
  verifyOAuthTransaction,
} from "../lib/auth/oauth-state.ts";

const SECRET = "unit-test-oauth-secret-at-least-32-characters";
const NOW = Date.parse("2026-08-30T02:00:00.000Z");

test("OAuth transaction uses S256 PKCE and round-trips signed state", async () => {
  const transaction = await createOAuthTransaction(SECRET, NOW);
  const expectedChallenge = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(transaction.codeVerifier)),
  ).toString("base64url");
  assert.equal(transaction.codeChallenge, expectedChallenge);
  assert.match(transaction.state, /^[A-Za-z0-9_-]{32,128}$/);
  assert.ok(transaction.codeVerifier.length >= 43 && transaction.codeVerifier.length <= 128);
  assert.deepEqual(
    await verifyOAuthTransaction(transaction.cookieValue, transaction.state, SECRET, NOW + 1000),
    { state: transaction.state, codeVerifier: transaction.codeVerifier },
  );
});

test("OAuth transaction rejects mismatched, tampered, and expired state", async () => {
  const transaction = await createOAuthTransaction(SECRET, NOW);
  assert.equal(
    await verifyOAuthTransaction(transaction.cookieValue, "different-state", SECRET, NOW + 1000),
    null,
  );
  assert.equal(
    await verifyOAuthTransaction(`${transaction.cookieValue}x`, transaction.state, SECRET, NOW + 1000),
    null,
  );
  assert.equal(
    await verifyOAuthTransaction(transaction.cookieValue, transaction.state, SECRET, NOW + 10 * 60 * 1000),
    null,
  );
});

test("denied identity is short-lived and signed", async () => {
  const identity = { openId: "ou_acceptance_operator", displayName: "Jack" };
  const token = await createDeniedIdentityToken(identity, SECRET, NOW);
  assert.deepEqual(await verifyDeniedIdentityToken(token, SECRET, NOW + 1000), identity);
  assert.equal(await verifyDeniedIdentityToken(`${token}x`, SECRET, NOW + 1000), null);
  assert.equal(await verifyDeniedIdentityToken(token, SECRET, NOW + 5 * 60 * 1000), null);
});

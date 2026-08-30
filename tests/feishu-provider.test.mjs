import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeishuAuthorizeUrl,
  exchangeFeishuCode,
  fetchFeishuIdentity,
  FEISHU_TOKEN_ENDPOINT,
  FEISHU_USER_INFO_ENDPOINT,
} from "../lib/auth/feishu-provider.ts";

const CONFIG = {
  clientId: "cli_test",
  clientSecret: "secret-test-value",
  redirectUri: "http://localhost:3001/api/auth/feishu/callback",
};

test("authorization URL includes state and S256 PKCE without requesting extra scopes", () => {
  const url = buildFeishuAuthorizeUrl(CONFIG, {
    state: "state-value",
    codeChallenge: "challenge-value",
  });
  assert.equal(url.searchParams.get("client_id"), CONFIG.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), CONFIG.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-value");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("scope"), false);
});

test("token exchange uses Feishu JSON contract and returns access token", async () => {
  let captured;
  const token = await exchangeFeishuCode(CONFIG, "authorization-code", "code-verifier", async (url, init) => {
    captured = { url, init };
    return Response.json({ code: 0, access_token: "u-test-token", token_type: "Bearer" });
  });
  assert.equal(token, "u-test-token");
  assert.equal(captured.url, FEISHU_TOKEN_ENDPOINT);
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["Content-Type"], "application/json");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.grant_type, "authorization_code");
  assert.equal(body.client_id, CONFIG.clientId);
  assert.equal(body.client_secret, CONFIG.clientSecret);
  assert.equal(body.code, "authorization-code");
  assert.equal(body.redirect_uri, CONFIG.redirectUri);
  assert.equal(body.code_verifier, "code-verifier");
});

test("user info maps open_id and allows missing email", async () => {
  let captured;
  const identity = await fetchFeishuIdentity("u-test-token", async (url, init) => {
    captured = { url, init };
    return Response.json({
      code: 0,
      data: {
        open_id: "ou_acceptance_operator",
        union_id: "on_acceptance_operator",
        tenant_key: "tenant_acceptance",
        name: "Jack",
        en_name: "Jack",
        avatar_url: "https://example.invalid/jack.png",
      },
    });
  });
  assert.deepEqual(identity, {
    openId: "ou_acceptance_operator",
    unionId: "on_acceptance_operator",
    tenantKey: "tenant_acceptance",
    email: "",
    displayName: "Jack",
    enName: "Jack",
    avatarUrl: "https://example.invalid/jack.png",
  });
  assert.equal(captured.url, FEISHU_USER_INFO_ENDPOINT);
  assert.equal(captured.init.headers.Authorization, "Bearer u-test-token");
});

test("provider errors do not expose provider response text", async () => {
  await assert.rejects(
    exchangeFeishuCode(CONFIG, "bad-code", "code-verifier", async () =>
      Response.json({ code: 20003, message: "provider-secret-detail" }, { status: 400 }),
    ),
    (error) => error.code === "token_exchange_failed" && !error.message.includes("provider-secret-detail"),
  );
});

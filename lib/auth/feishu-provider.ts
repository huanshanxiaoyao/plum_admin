export const FEISHU_AUTHORIZE_ENDPOINT = "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
export const FEISHU_TOKEN_ENDPOINT = "https://accounts.feishu.cn/oauth/v3/token";
export const FEISHU_USER_INFO_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v1/user_info";

export type FeishuOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type FeishuIdentity = {
  openId: string;
  email: string;
  displayName: string;
};

export class FeishuOAuthError extends Error {
  constructor(readonly code: "configuration_error" | "token_exchange_failed" | "user_info_failed") {
    super(code);
    this.name = "FeishuOAuthError";
  }
}

export function loadFeishuOAuthConfig(): FeishuOAuthConfig {
  const clientId = process.env.FEISHU_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.FEISHU_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.FEISHU_REDIRECT_URI?.trim() ?? "";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new FeishuOAuthError("configuration_error");
  }
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new FeishuOAuthError("configuration_error");
  }
  const localHttp =
    redirect.protocol === "http:" &&
    (redirect.hostname === "localhost" || redirect.hostname === "127.0.0.1");
  if (
    (!localHttp && redirect.protocol !== "https:") ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== "/api/auth/feishu/callback"
  ) {
    throw new FeishuOAuthError("configuration_error");
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}

export function buildFeishuAuthorizeUrl(
  config: FeishuOAuthConfig,
  transaction: { state: string; codeChallenge: string },
): URL {
  const url = new URL(FEISHU_AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state: transaction.state,
    code_challenge: transaction.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url;
}

export async function exchangeFeishuCode(
  config: FeishuOAuthConfig,
  code: string,
  codeVerifier: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });
  let response: Response;
  try {
    response = await fetcher(FEISHU_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new FeishuOAuthError("token_exchange_failed");
  }
  const payload = await readJsonObject(response);
  if (!response.ok || payload?.code !== 0 || typeof payload.access_token !== "string") {
    throw new FeishuOAuthError("token_exchange_failed");
  }
  return payload.access_token;
}

export async function fetchFeishuIdentity(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<FeishuIdentity> {
  let response: Response;
  try {
    response = await fetcher(FEISHU_USER_INFO_ENDPOINT, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new FeishuOAuthError("user_info_failed");
  }
  const payload = await readJsonObject(response);
  const candidate = payload?.data;
  const data = candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
  if (
    !response.ok ||
    payload?.code !== 0 ||
    !data ||
    typeof data.open_id !== "string" ||
    !data.open_id.trim()
  ) {
    throw new FeishuOAuthError("user_info_failed");
  }
  const displayName = firstString(data.name, data.en_name) || "飞书用户";
  const email = firstString(data.enterprise_email, data.email);
  return { openId: data.open_id.trim(), email, displayName };
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

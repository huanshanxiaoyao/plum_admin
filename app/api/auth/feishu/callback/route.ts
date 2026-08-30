import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isFeishuAuthEnabled } from "@/lib/auth/auth-mode";
import {
  exchangeFeishuCode,
  fetchFeishuIdentity,
  loadFeishuOAuthConfig,
} from "@/lib/auth/feishu-provider";
import {
  createDeniedIdentityToken,
  verifyOAuthTransaction,
} from "@/lib/auth/oauth-state";
import { resolveRemoteAdminIdentity } from "@/lib/auth/remote-identity";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/session-token";
import { AdminApiError } from "@/lib/bff/client";
import {
  DENIED_IDENTITY_COOKIE_NAME,
  deniedIdentityCookieOptions,
  OAUTH_TRANSACTION_COOKIE_NAME,
  oauthTransactionCookieOptions,
} from "@/lib/auth/oauth-cookies";

const SAFE_DENIAL_CODES = new Set([
  "admin_user_disabled",
  "admin_user_unknown",
  "admin_role_unsupported",
  "admin_identity_conflict",
]);

export async function GET(request: NextRequest) {
  if (!isFeishuAuthEnabled()) return clearOAuthCookie(redirect(request, "/login"));

  const secret = getSessionSecret();
  const state = request.nextUrl.searchParams.get("state");
  const transaction = await verifyOAuthTransaction(
    request.cookies.get(OAUTH_TRANSACTION_COOKIE_NAME)?.value,
    state,
    secret,
  );
  if (!transaction) {
    return clearOAuthCookie(redirect(request, "/login?error=invalid_oauth_state"));
  }
  if (request.nextUrl.searchParams.has("error")) {
    return clearOAuthCookie(redirect(request, "/login?error=authorization_declined"));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 2048) {
    return clearOAuthCookie(redirect(request, "/login?error=login_failed"));
  }

  let feishuIdentity: Awaited<ReturnType<typeof fetchFeishuIdentity>> | undefined;
  try {
    const config = loadFeishuOAuthConfig();
    const accessToken = await exchangeFeishuCode(config, code, transaction.codeVerifier);
    feishuIdentity = await fetchFeishuIdentity(accessToken);
    const identity = await resolveRemoteAdminIdentity({
      id: feishuIdentity.openId,
      email: feishuIdentity.email,
    });
    const sessionToken = await createSessionToken(identity, secret);
    const response = clearOAuthCookie(redirect(request, "/"));
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());
    response.cookies.set(DENIED_IDENTITY_COOKIE_NAME, "", {
      ...deniedIdentityCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 403 && feishuIdentity) {
      const code = SAFE_DENIAL_CODES.has(error.code) ? error.code : "admin_user_unknown";
      const response = clearOAuthCookie(redirect(request, `/access-denied?code=${code}`));
      response.cookies.set(
        DENIED_IDENTITY_COOKIE_NAME,
        await createDeniedIdentityToken(feishuIdentity, secret),
        deniedIdentityCookieOptions(),
      );
      return response;
    }
    return clearOAuthCookie(redirect(request, "/login?error=login_failed"));
  }
}

function redirect(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path.split("?", 1)[0];
  url.search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
  url.hash = "";
  return NextResponse.redirect(url, 302);
}

function clearOAuthCookie(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(OAUTH_TRANSACTION_COOKIE_NAME, "", {
    ...oauthTransactionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

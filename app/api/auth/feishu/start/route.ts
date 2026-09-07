import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isFeishuAuthEnabled } from "@/lib/auth/auth-mode";
import {
  buildFeishuAuthorizeUrl,
  loadFeishuOAuthConfig,
} from "@/lib/auth/feishu-provider";
import { createOAuthTransaction } from "@/lib/auth/oauth-state";
import { getSessionSecret } from "@/lib/auth/session";
import { loginUrl, safeReturnTo } from "@/lib/auth/return-to";
import {
  OAUTH_TRANSACTION_COOKIE_NAME,
  oauthTransactionCookieOptions,
} from "@/lib/auth/oauth-cookies";
import { publicUrl } from "@/lib/server/origin";

export async function GET(request: NextRequest) {
  if (!isFeishuAuthEnabled()) {
    return new Response(null, { status: 404 });
  }
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  try {
    const config = loadFeishuOAuthConfig();
    const transaction = await createOAuthTransaction(getSessionSecret(), Date.now(), returnTo);
    const response = NextResponse.redirect(buildFeishuAuthorizeUrl(config, transaction), 302);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      OAUTH_TRANSACTION_COOKIE_NAME,
      transaction.cookieValue,
      oauthTransactionCookieOptions(),
    );
    return response;
  } catch {
    return NextResponse.redirect(publicUrl(request, loginUrl(returnTo, "login_configuration")), 302);
  }
}

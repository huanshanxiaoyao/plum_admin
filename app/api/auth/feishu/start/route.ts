import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isFeishuAuthEnabled } from "@/lib/auth/auth-mode";
import {
  buildFeishuAuthorizeUrl,
  loadFeishuOAuthConfig,
} from "@/lib/auth/feishu-provider";
import { createOAuthTransaction } from "@/lib/auth/oauth-state";
import { getSessionSecret } from "@/lib/auth/session";
import {
  OAUTH_TRANSACTION_COOKIE_NAME,
  oauthTransactionCookieOptions,
} from "@/lib/auth/oauth-cookies";
import { publicUrl } from "@/lib/server/origin";

export async function GET(request: NextRequest) {
  if (!isFeishuAuthEnabled()) {
    return new Response(null, { status: 404 });
  }
  try {
    const config = loadFeishuOAuthConfig();
    const transaction = await createOAuthTransaction(getSessionSecret());
    const response = NextResponse.redirect(buildFeishuAuthorizeUrl(config, transaction), 302);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      OAUTH_TRANSACTION_COOKIE_NAME,
      transaction.cookieValue,
      oauthTransactionCookieOptions(),
    );
    return response;
  } catch {
    return NextResponse.redirect(publicUrl(request, "/login?error=login_configuration"), 302);
  }
}

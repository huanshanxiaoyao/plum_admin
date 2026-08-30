export const OAUTH_TRANSACTION_COOKIE_NAME = "plum_admin_oauth_transaction";
export const DENIED_IDENTITY_COOKIE_NAME = "plum_admin_denied_identity";

export function oauthTransactionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/feishu/callback",
    maxAge: 10 * 60,
  };
}

export function deniedIdentityCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/access-denied",
    maxAge: 5 * 60,
  };
}

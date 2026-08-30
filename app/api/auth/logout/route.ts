import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import {
  DENIED_IDENTITY_COOKIE_NAME,
  deniedIdentityCookieOptions,
} from "@/lib/auth/oauth-cookies";
import { isSameOrigin, jsonError, requestIdFrom } from "@/lib/server/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(request, 403, "csrf_rejected", "Request origin was rejected.");
  }
  const requestId = requestIdFrom(request);
  const response = NextResponse.json(
    { data: { signed_out: true }, meta: { request_id: requestId } },
    { headers: { "X-Request-Id": requestId } },
  );
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  response.cookies.set(DENIED_IDENTITY_COOKIE_NAME, "", {
    ...deniedIdentityCookieOptions(),
    maxAge: 0,
  });
  return response;
}

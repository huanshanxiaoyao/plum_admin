import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/auth/session";
import { AdminApiError } from "@/lib/bff/client";
import { jsonError, requestIdFrom } from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  let identity;
  try {
    identity = await getCurrentIdentity(requestId);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    return NextResponse.json(
      { error: { code: error.code, message: error.message, request_id: error.requestId ?? requestId } },
      { status: error.status, headers: { "X-Request-Id": error.requestId ?? requestId } },
    );
  }
  if (!identity) {
    return jsonError(request, 401, "admin_unauthenticated", "Sign in to continue.");
  }
  return NextResponse.json(
    { data: identity, meta: { request_id: requestId } },
    { headers: { "X-Request-Id": requestId } },
  );
}

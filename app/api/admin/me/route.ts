import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/auth/session";
import { jsonError, requestIdFrom } from "@/lib/server/http";

export async function GET(request: Request) {
  const identity = await getCurrentIdentity();
  if (!identity) {
    return jsonError(request, 401, "admin_unauthenticated", "Sign in to continue.");
  }
  const requestId = requestIdFrom(request);
  return NextResponse.json(
    { data: identity, meta: { request_id: requestId } },
    { headers: { "X-Request-Id": requestId } },
  );
}

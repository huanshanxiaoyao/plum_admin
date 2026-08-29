import { NextResponse } from "next/server";
export { isSameOrigin } from "./origin.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestIdFrom(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && UUID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function jsonError(
  request: Request,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  const requestId = requestIdFrom(request);
  return NextResponse.json(
    { error: { code, message, request_id: requestId, details } },
    { status, headers: { "X-Request-Id": requestId } },
  );
}

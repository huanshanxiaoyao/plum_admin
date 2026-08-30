import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/auth/session";
import { AdminApiError } from "@/lib/bff/client";
import { encodeBackendPath, requiredCapability } from "@/lib/bff/allowlist";
import { adminApiOrigin, adminApiWritesEnabled } from "@/lib/bff/config";
import { isSameOrigin, jsonError, requestIdFrom } from "@/lib/server/http";

type RouteContext = { params: Promise<{ path: string[] }> };

const FORWARDED_REQUEST_HEADERS = ["content-type", "idempotency-key", "if-match"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "etag"];

async function proxy(request: Request, context: RouteContext) {
  if (request.method !== "GET" && request.method !== "HEAD" && !isSameOrigin(request)) {
    return jsonError(request, 403, "csrf_rejected", "Request origin was rejected.");
  }
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

  const { path: segments } = await context.params;
  const path = segments.join("/");
  const backendPath = encodeBackendPath(segments);
  if (!backendPath) {
    return jsonError(request, 404, "resource_not_found", "Resource not found.");
  }
  const capability = requiredCapability(request.method, path);
  if (!capability) {
    return jsonError(request, 404, "resource_not_found", "Resource not found.");
  }
  if (!identity.capabilities.includes(capability)) {
    return jsonError(
      request,
      403,
      "admin_permission_denied",
      "You do not have permission to perform this action.",
    );
  }

  if (request.method !== "GET" && request.method !== "HEAD" && !adminApiWritesEnabled()) {
    return jsonError(request, 403, "admin_writes_disabled", "Admin API writes are disabled.");
  }

  const bffToken = process.env.PLUM_ADMIN_BFF_TOKEN;
  if (!bffToken) {
    return jsonError(request, 503, "dependency_unavailable", "Admin API is not configured.");
  }

  const incomingUrl = new URL(request.url);
  let backendUrl: URL;
  try {
    backendUrl = new URL(`/admin/plum/${backendPath}${incomingUrl.search}`, adminApiOrigin());
  } catch {
    return jsonError(request, 503, "dependency_unavailable", "Admin API is not configured.");
  }
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${bffToken}`,
    "X-Admin-User-Id": identity.id,
    "X-Admin-Email": identity.email,
    "X-Request-Id": requestId,
  });
  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }

  try {
    const response = await fetch(backendUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    });
    const responseHeaders = new Headers({ "X-Request-Id": response.headers.get("x-request-id") ?? requestId });
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return jsonError(request, 503, "dependency_unavailable", "Admin API is unavailable.");
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;

import { NextResponse } from "next/server";
import { capabilitiesForRole, isAdminRole } from "@/lib/auth/capabilities";
import { getMockIdentity, isMockAuthEnabled } from "@/lib/auth/mock-identities";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/session-token";
import { isSameOrigin, jsonError, requestIdFrom } from "@/lib/server/http";

export async function POST(request: Request) {
  if (!isMockAuthEnabled()) {
    return jsonError(request, 404, "resource_not_found", "Resource not found.");
  }
  if (!isSameOrigin(request)) {
    return jsonError(request, 403, "csrf_rejected", "Request origin was rejected.");
  }

  let role: unknown;
  try {
    ({ role } = await request.json());
  } catch {
    return jsonError(request, 400, "invalid_argument", "Request body must be valid JSON.");
  }
  if (!isAdminRole(role)) {
    return jsonError(request, 422, "validation_failed", "Select a valid role.", {
      fields: { role: "must be operator or admin" },
    });
  }

  const identity = getMockIdentity(role);
  const token = await createSessionToken(identity, getSessionSecret());
  const requestId = requestIdFrom(request);
  const response = NextResponse.json(
    {
      data: { ...identity, capabilities: capabilitiesForRole(role) },
      meta: { request_id: requestId },
    },
    { headers: { "X-Request-Id": requestId } },
  );
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

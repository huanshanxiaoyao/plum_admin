import "server-only";

import { AdminApiError } from "../bff/client.ts";
import { adminApiOrigin } from "../bff/config.ts";
import { parseBackendAdminIdentity } from "./identity-contract.ts";
import type { AdminIdentity } from "./types.ts";

export type ProviderIdentity = {
  id: string;
  email: string;
};

export async function resolveRemoteAdminIdentity(
  providerIdentity: ProviderIdentity,
  requestId = crypto.randomUUID(),
): Promise<AdminIdentity> {
  const token = process.env.PLUM_ADMIN_BFF_TOKEN?.trim();
  if (!token) {
    throw new AdminApiError(503, "dependency_unavailable", "Admin API is not configured.", requestId);
  }

  const url = new URL("/admin/plum/me", adminApiOrigin());
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Admin-User-Id": providerIdentity.id,
        "X-Admin-Email": providerIdentity.email,
        "X-Request-Id": requestId,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AdminApiError(503, "dependency_unavailable", "Admin API is unavailable.", requestId);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new AdminApiError(response.status, "unexpected_response", "Unexpected API response.", requestId);
  }
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = isErrorPayload(body) ? body.error : {};
    throw new AdminApiError(
      response.status,
      typeof error.code === "string" ? error.code : "request_failed",
      typeof error.message === "string" ? error.message : "Request failed.",
      typeof error.request_id === "string" ? error.request_id : requestId,
    );
  }
  try {
    return parseBackendAdminIdentity(body);
  } catch {
    throw new AdminApiError(response.status, "unexpected_response", "Unexpected API response.", requestId);
  }
}

function isErrorPayload(value: unknown): value is { error: Record<string, unknown> } {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  return Boolean(value.error) && typeof value.error === "object";
}

import "server-only";

import { AdminApiError } from "../bff/client.ts";
import { adminApiOrigin } from "../bff/config.ts";
import { parseBackendAdminIdentity } from "./identity-contract.ts";
import type { AdminIdentity } from "./types.ts";
import type { FeishuIdentity } from "./feishu-provider.ts";

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

  return parseIdentityResponse(response, requestId);
}

export async function registerRemoteAdminIdentity(
  providerIdentity: FeishuIdentity,
  requestId = crypto.randomUUID(),
): Promise<AdminIdentity> {
  const token = process.env.PLUM_ADMIN_BFF_TOKEN?.trim();
  if (!token) {
    throw new AdminApiError(503, "dependency_unavailable", "Admin API is not configured.", requestId);
  }

  const url = new URL("/admin/plum/session", adminApiOrigin());
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({
        open_id: providerIdentity.openId,
        union_id: providerIdentity.unionId,
        tenant_key: providerIdentity.tenantKey,
        display_name: providerIdentity.displayName,
        en_name: providerIdentity.enName,
        email: providerIdentity.email,
        avatar_url: providerIdentity.avatarUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AdminApiError(503, "dependency_unavailable", "Admin API is unavailable.", requestId);
  }
  return parseIdentityResponse(response, requestId);
}

async function parseIdentityResponse(response: Response, requestId: string): Promise<AdminIdentity> {
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

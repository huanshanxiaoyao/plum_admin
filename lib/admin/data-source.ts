import "server-only";

import { getCurrentIdentity } from "../auth/session.ts";
import { AdminApiError } from "../bff/client.ts";
import { adminApiOrigin, adminDataSourceMode } from "../bff/config.ts";
import type {
  AdminListQuery,
  AdminListResponseMap,
  AdminListSection,
} from "./contracts.ts";
import { parseListResponse } from "./contracts.ts";
import { fixtureList } from "./fixtures.ts";

const RESOURCE_PATHS: Record<AdminListSection, string> = {
  characters: "characters",
  creators: "creators",
  users: "users",
  subscriptions: "subscriptions",
  staff: "admin-users",
};

function normalizeQuery(query: AdminListQuery) {
  const q = query.q?.trim().slice(0, 120) || undefined;
  const status = query.status?.trim().slice(0, 40) || undefined;
  const limit = Number.isInteger(query.limit) ? Math.min(200, Math.max(1, query.limit ?? 50)) : 50;
  return { q, status, limit, cursor: query.cursor?.trim() || undefined };
}

export async function listAdminResources<Section extends AdminListSection>(
  section: Section,
  query: AdminListQuery = {},
): Promise<AdminListResponseMap[Section]> {
  const normalized = normalizeQuery(query);
  if (adminDataSourceMode() === "fixture") {
    return fixtureList(section, normalized);
  }

  const identity = await getCurrentIdentity();
  if (!identity) throw new AdminApiError(401, "admin_unauthenticated", "Sign in to continue.");
  const token = process.env.PLUM_ADMIN_BFF_TOKEN?.trim();
  if (!token) throw new AdminApiError(503, "dependency_unavailable", "Admin API is not configured.");

  const url = new URL(`/admin/plum/${RESOURCE_PATHS[section]}`, adminApiOrigin());
  for (const [key, value] of Object.entries(normalized)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Admin-User-Id": identity.id,
        "X-Admin-Email": identity.email,
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
    const error = body && typeof body === "object" && "error" in body ? body.error : null;
    const payload = error && typeof error === "object" ? error as Record<string, unknown> : {};
    throw new AdminApiError(
      response.status,
      typeof payload.code === "string" ? payload.code : "request_failed",
      typeof payload.message === "string" ? payload.message : "Request failed.",
      typeof payload.request_id === "string" ? payload.request_id : requestId,
    );
  }
  try {
    return parseListResponse(section, body);
  } catch {
    throw new AdminApiError(response.status, "unexpected_response", "Unexpected API response.", requestId);
  }
}

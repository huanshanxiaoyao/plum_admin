import "server-only";

import { getCurrentIdentity } from "../../lib/auth/session.ts";
import { AdminApiError } from "../../lib/bff/client.ts";
import { adminApiOrigin, adminDataSourceMode } from "../../lib/bff/config.ts";
import type {
  AdminListQuery,
  AdminListResponseMap,
  AdminListSection,
  CharacterListQuery,
  CharacterVersionListQuery,
  WorkListQuery,
} from "./contracts.ts";
import {
  parseCharacterListResponse,
  parseCharacterResponse,
  parseCharacterVersionListResponse,
  parseListResponse,
  parseWorkListResponse,
  parseWorkResponse,
} from "./contracts.ts";
import {
  fixtureCharacter,
  fixtureCharacterList,
  fixtureCharacterVersions,
  fixtureList,
  fixtureWork,
  fixtureWorkList,
} from "./fixtures.ts";

const RESOURCE_PATHS: Record<AdminListSection, string> = {
  characters: "characters",
  creators: "creators",
  users: "users",
  subscriptions: "subscriptions",
  staff: "admin-users",
};

function clean(value: string | undefined, maxLength: number): string | undefined {
  return value?.trim().slice(0, maxLength) || undefined;
}

function limit(value: number | undefined): number {
  return Number.isInteger(value) ? Math.min(200, Math.max(1, value ?? 50)) : 50;
}

function oneOf<T extends string>(value: string | undefined, values: readonly T[]): T | undefined {
  return values.includes(value as T) ? value as T : undefined;
}

function normalizeQuery(query: AdminListQuery) {
  return {
    q: clean(query.q, 120),
    status: clean(query.status, 40),
    limit: limit(query.limit),
    cursor: clean(query.cursor, 2048),
  };
}

function normalizeCharacterQuery(query: CharacterListQuery): CharacterListQuery {
  return {
    q: clean(query.q, 200),
    status: oneOf(query.status, ["draft", "active", "takedown", "archived"]),
    rating: oneOf(query.rating, ["general", "mature"]),
    visibility: oneOf(query.visibility, ["public", "private"]),
    source: oneOf(query.source, ["official", "ugc"]),
    sort: oneOf(query.sort, ["created_at.desc", "created_at.asc", "updated_at.desc", "updated_at.asc"]),
    limit: limit(query.limit),
    cursor: clean(query.cursor, 2048),
  };
}

function normalizeWorkQuery(query: WorkListQuery): WorkListQuery {
  return {
    q: clean(query.q, 200),
    owner: clean(query.owner, 200),
    state: oneOf(query.state, ["draft", "published", "archived"]),
    moderation: oneOf(query.moderation, ["not_submitted", "pending_review", "approved", "rejected"]),
    sort: oneOf(query.sort, ["updated_at.desc", "updated_at.asc", "created_at.desc", "created_at.asc"]),
    limit: limit(query.limit),
    cursor: clean(query.cursor, 2048),
  };
}

function normalizeVersionQuery(query: CharacterVersionListQuery): CharacterVersionListQuery {
  return {
    sort: oneOf(query.sort, ["created_at.desc", "created_at.asc"]),
    limit: limit(query.limit),
    cursor: clean(query.cursor, 2048),
  };
}

async function adminApiGet(path: string, query: Record<string, string | number | undefined> = {}): Promise<unknown> {
  const identity = await getCurrentIdentity();
  if (!identity) throw new AdminApiError(401, "admin_unauthenticated", "Sign in to continue.");
  const token = process.env.PLUM_ADMIN_BFF_TOKEN?.trim();
  if (!token) throw new AdminApiError(503, "dependency_unavailable", "Admin API is not configured.");

  const url = new URL(`/admin/plum/${path}`, adminApiOrigin());
  for (const [key, value] of Object.entries(query)) {
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
  return body;
}

function unexpected(error: unknown): never {
  if (error instanceof AdminApiError) throw error;
  throw new AdminApiError(502, "unexpected_response", "Unexpected API response.");
}

export async function listAdminResources<Section extends AdminListSection>(
  section: Section,
  query: AdminListQuery = {},
): Promise<AdminListResponseMap[Section]> {
  const normalized = normalizeQuery(query);
  if (adminDataSourceMode() === "fixture") return fixtureList(section, normalized);
  try {
    return parseListResponse(section, await adminApiGet(RESOURCE_PATHS[section], normalized));
  } catch (error) {
    unexpected(error);
  }
}

export async function listAdminCharacters(query: CharacterListQuery = {}) {
  const normalized = normalizeCharacterQuery(query);
  if (adminDataSourceMode() === "fixture") return fixtureCharacterList(normalized);
  try {
    return parseCharacterListResponse(await adminApiGet("characters", normalized));
  } catch (error) {
    unexpected(error);
  }
}

export async function getAdminCharacter(id: string) {
  if (adminDataSourceMode() === "fixture") {
    const response = fixtureCharacter(id);
    if (!response) throw new AdminApiError(404, "not_found", "Character not found.");
    return response;
  }
  try {
    return parseCharacterResponse(await adminApiGet(`characters/${encodeURIComponent(id)}`));
  } catch (error) {
    unexpected(error);
  }
}

export async function listAdminCharacterVersions(id: string, query: CharacterVersionListQuery = {}) {
  const normalized = normalizeVersionQuery(query);
  if (adminDataSourceMode() === "fixture") return fixtureCharacterVersions(id, normalized);
  try {
    return parseCharacterVersionListResponse(
      await adminApiGet(`characters/${encodeURIComponent(id)}/versions`, normalized),
    );
  } catch (error) {
    unexpected(error);
  }
}

export async function listAdminWorks(query: WorkListQuery = {}) {
  const normalized = normalizeWorkQuery(query);
  if (adminDataSourceMode() === "fixture") return fixtureWorkList(normalized);
  try {
    return parseWorkListResponse(await adminApiGet("works", normalized));
  } catch (error) {
    unexpected(error);
  }
}

export async function getAdminWork(id: string) {
  if (adminDataSourceMode() === "fixture") {
    const response = fixtureWork(id);
    if (!response) throw new AdminApiError(404, "not_found", "Work not found.");
    return response;
  }
  try {
    return parseWorkResponse(await adminApiGet(`works/${encodeURIComponent(id)}`));
  } catch (error) {
    unexpected(error);
  }
}

import type { components as AdminApiComponents } from "../../contracts/generated/admin-api.ts";

type AdminApiSchemas = AdminApiComponents["schemas"];

export type AdminListSection = "characters" | "creators" | "users" | "subscriptions" | "staff";

export type PageInfo = AdminApiSchemas["PageInfo"];

export type ListResponse<T> = {
  data: T[];
  page: PageInfo;
  meta: { request_id: string };
};

export type CharacterSummary = AdminApiSchemas["AdminCharacterItem"];
export type CharacterVersion = AdminApiSchemas["AdminCharacterVersionItem"];
export type WorkSummary = AdminApiSchemas["AdminWorkItem"];

export type CreatorSummary = {
  platform_user_id: string;
  profile_id: string;
  display_name: string;
  control_status: "active" | "restricted";
  draft_count: number;
  published_count: number;
  takedown_count: number;
  last_created_at: string | null;
};

export type UserSummary = {
  platform_user_id: string;
  display_name: string;
  masked_login: string;
  membership_status: "active" | "disabled";
  subscription: {
    plan: "free" | "standard" | "premium";
    status: "active" | "cancelled";
    billing_connected: false;
  };
  character_count: number;
  last_active_at: string | null;
};

export type SubscriptionSummary = {
  id: string;
  platform_user_id: string;
  display_name: string;
  plan: "free" | "standard" | "premium";
  status: "active" | "cancelled";
  billing_connected: false;
  updated_at: string;
};

export type StaffSummary = AdminApiSchemas["AdminUserItem"];

export type AdminListResourceMap = {
  characters: CharacterSummary;
  creators: CreatorSummary;
  users: UserSummary;
  subscriptions: SubscriptionSummary;
  staff: StaffSummary;
};

export type AdminListResponseMap = {
  [Section in AdminListSection]: ListResponse<AdminListResourceMap[Section]>;
};

export type AdminListQuery = {
  q?: string;
  status?: string;
  limit?: number;
  cursor?: string;
};

export type CharacterListQuery = AdminListQuery & {
  rating?: CharacterSummary["content_rating"];
  visibility?: CharacterSummary["visibility"];
  source?: CharacterSummary["source"];
  sort?: "created_at.desc" | "created_at.asc" | "updated_at.desc" | "updated_at.asc";
};

export type WorkListQuery = {
  q?: string;
  owner?: string;
  state?: WorkSummary["state"];
  moderation?: WorkSummary["moderation"];
  sort?: "updated_at.desc" | "updated_at.asc" | "created_at.desc" | "created_at.asc";
  limit?: number;
  cursor?: string;
};

export type CharacterVersionListQuery = {
  sort?: "created_at.desc" | "created_at.asc";
  limit?: number;
  cursor?: string;
};

export type WorkListResponse = ListResponse<WorkSummary>;
export type CharacterVersionListResponse = ListResponse<CharacterVersion>;
export type SingleResponse<T> = {
  data: T;
  meta: { request_id: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "number" && Number.isFinite(record[key]);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || isNullableString(value);
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isUtcTimestamp(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function isContentOwner(value: unknown): boolean {
  return isRecord(value) &&
    hasString(value, "profile_id") &&
    hasString(value, "display_name") &&
    isOptionalNullableString(value.platform_user_id);
}

function isPageInfo(value: unknown): value is PageInfo {
  return isRecord(value) &&
    isPositiveInteger(value.limit) &&
    isOptionalNullableString(value.next_cursor) &&
    typeof value.has_more === "boolean";
}

function isResponseMeta(value: unknown): value is { request_id: string } {
  return isRecord(value) && hasString(value, "request_id");
}

function containsPrivateContent(record: Record<string, unknown>): boolean {
  return ["prompt", "prompt_text", "intro", "greeting", "content_json"].some((key) => key in record);
}

function isCharacter(value: unknown): value is CharacterSummary {
  if (!isRecord(value) || containsPrivateContent(value) || !isContentOwner(value.creator) || !isRecord(value.stats)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "display_name") &&
    (value.source === "official" || value.source === "ugc") &&
    hasString(value, "work_id") &&
    (value.status === "draft" || value.status === "active" || value.status === "takedown" || value.status === "archived") &&
    (value.content_rating === "general" || value.content_rating === "mature") &&
    (value.visibility === "public" || value.visibility === "private") &&
    isPositiveInteger(value.content_version) &&
    isPositiveInteger(value.prompt_version) &&
    isUtcTimestamp(value.created_at) &&
    isUtcTimestamp(value.updated_at) &&
    isOptionalNullableString(value.published_at) &&
    isNonNegativeInteger(value.stats.interaction_count) &&
    isNonNegativeInteger(value.stats.like_count) &&
    isNonNegativeInteger(value.stats.favorite_count)
  );
}

function isCharacterVersion(value: unknown): value is CharacterVersion {
  if (!isRecord(value) || containsPrivateContent(value)) return false;
  return hasString(value, "character_id") &&
    isPositiveInteger(value.version_number) &&
    isPositiveInteger(value.prompt_version) &&
    hasString(value, "display_name") &&
    (value.creator_declared_rating === "general" || value.creator_declared_rating === "mature") &&
    (value.platform_effective_rating === "general" || value.platform_effective_rating === "mature") &&
    hasString(value, "access_policy_version") &&
    (value.visibility === "public" || value.visibility === "private") &&
    isOptionalNullableString(value.moderation_decision_id) &&
    isUtcTimestamp(value.created_at);
}

function isWork(value: unknown): value is WorkSummary {
  if (!isRecord(value) || containsPrivateContent(value) || !isContentOwner(value.owner)) return false;
  return hasString(value, "id") &&
    hasString(value, "display_name") &&
    (value.source === "official" || value.source === "ugc") &&
    (value.lifecycle_status === "active" || value.lifecycle_status === "archived") &&
    (value.state === "draft" || value.state === "published" || value.state === "archived") &&
    (value.moderation === "not_submitted" || value.moderation === "pending_review" || value.moderation === "approved" || value.moderation === "rejected") &&
    (value.revision === undefined || value.revision === null || isPositiveInteger(value.revision)) &&
    isOptionalNullableString(value.published_character_id) &&
    isOptionalNullableString(value.submitted_at) &&
    isOptionalNullableString(value.reviewed_at) &&
    isUtcTimestamp(value.created_at) &&
    isUtcTimestamp(value.updated_at);
}

function isCreator(value: unknown): value is CreatorSummary {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "platform_user_id") &&
    hasString(value, "profile_id") &&
    hasString(value, "display_name") &&
    (value.control_status === "active" || value.control_status === "restricted") &&
    hasNumber(value, "draft_count") &&
    hasNumber(value, "published_count") &&
    hasNumber(value, "takedown_count") &&
    isNullableString(value.last_created_at)
  );
}

function isUser(value: unknown): value is UserSummary {
  if (!isRecord(value) || !isRecord(value.subscription)) return false;
  return (
    hasString(value, "platform_user_id") &&
    hasString(value, "display_name") &&
    hasString(value, "masked_login") &&
    (value.membership_status === "active" || value.membership_status === "disabled") &&
    (value.subscription.plan === "free" ||
      value.subscription.plan === "standard" ||
      value.subscription.plan === "premium") &&
    (value.subscription.status === "active" || value.subscription.status === "cancelled") &&
    value.subscription.billing_connected === false &&
    hasNumber(value, "character_count") &&
    isNullableString(value.last_active_at)
  );
}

function isSubscription(value: unknown): value is SubscriptionSummary {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "platform_user_id") &&
    hasString(value, "display_name") &&
    (value.plan === "free" || value.plan === "standard" || value.plan === "premium") &&
    (value.status === "active" || value.status === "cancelled") &&
    value.billing_connected === false &&
    hasString(value, "updated_at")
  );
}

function isStaff(value: unknown): value is StaffSummary {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "open_id") &&
    isNullableString(value.union_id) &&
    hasString(value, "tenant_key") &&
    hasString(value, "display_name") &&
    isNullableString(value.en_name) &&
    isNullableString(value.email) &&
    isNullableString(value.avatar_url) &&
    (value.role === "operator" || value.role === "admin") &&
    (value.status === "active" || value.status === "disabled") &&
    hasString(value, "created_at") &&
    hasString(value, "last_login_at") &&
    hasString(value, "updated_at")
  );
}

const ITEM_GUARDS = {
  characters: isCharacter,
  creators: isCreator,
  users: isUser,
  subscriptions: isSubscription,
  staff: isStaff,
} as const;

export function parseListResponse<Section extends AdminListSection>(
  section: Section,
  value: unknown,
): AdminListResponseMap[Section] {
  if (!isRecord(value) || !Array.isArray(value.data) || !isPageInfo(value.page) || !isResponseMeta(value.meta)) {
    throw new TypeError(`Invalid ${section} list response envelope`);
  }
  if (
    (section === "staff" && !hasNumber(value.meta, "count")) ||
    !value.data.every(ITEM_GUARDS[section])
  ) {
    throw new TypeError(`Invalid ${section} list response payload`);
  }
  return value as AdminListResponseMap[Section];
}

function parseTypedList<T>(label: string, value: unknown, guard: (item: unknown) => item is T): ListResponse<T> {
  if (!isRecord(value) || !Array.isArray(value.data) || !isPageInfo(value.page) || !isResponseMeta(value.meta) || !value.data.every(guard)) {
    throw new TypeError(`Invalid ${label} list response payload`);
  }
  return value as ListResponse<T>;
}

function parseSingle<T>(label: string, value: unknown, guard: (item: unknown) => item is T): SingleResponse<T> {
  if (!isRecord(value) || !guard(value.data) || !isResponseMeta(value.meta)) {
    throw new TypeError(`Invalid ${label} response payload`);
  }
  return value as SingleResponse<T>;
}

export const parseCharacterListResponse = (value: unknown) => parseTypedList("character", value, isCharacter);
export const parseCharacterResponse = (value: unknown) => parseSingle("character", value, isCharacter);
export const parseCharacterVersionListResponse = (value: unknown) => parseTypedList("character version", value, isCharacterVersion);
export const parseWorkListResponse = (value: unknown) => parseTypedList("work", value, isWork);
export const parseWorkResponse = (value: unknown) => parseSingle("work", value, isWork);

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

export type CreatorSummary = AdminApiSchemas["AdminCreatorItem"];

export type UserSummary = AdminApiSchemas["AdminProductUserItem"];

export type OverviewData = AdminApiSchemas["AdminOverviewData"];
export type OverviewResponse = AdminApiSchemas["AdminOverviewResponse"];

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

export type CreatorListQuery = {
  q?: string;
  status?: CreatorSummary["control_status"];
  from?: string;
  to?: string;
  sort?: "last_created_at.desc" | "created_at.desc";
  limit?: number;
  cursor?: string;
};

export type UserListQuery = {
  q?: string;
  status?: UserSummary["membership_status"];
  created_from?: string;
  created_to?: string;
  sort?: "last_activity_at.desc" | "created_at.desc";
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
  if (
    !isRecord(value) ||
    ["email", "phone", "mobile", "prompt", "prompt_text", "greeting", "content_json"].some((key) => key in value)
  ) return false;
  return (
    hasString(value, "platform_user_id") &&
    hasString(value, "profile_id") &&
    hasString(value, "handle") &&
    hasString(value, "display_name") &&
    hasString(value, "profile_status") &&
    (value.control_status === "active" || value.control_status === "restricted") &&
    isNonNegativeInteger(value.work_count) &&
    isNonNegativeInteger(value.draft_count) &&
    isNonNegativeInteger(value.published_count) &&
    isNonNegativeInteger(value.rejected_count) &&
    isNonNegativeInteger(value.takedown_count) &&
    isNonNegativeInteger(value.interaction_count) &&
    isNonNegativeInteger(value.like_count) &&
    isNonNegativeInteger(value.favorite_count) &&
    isUtcTimestamp(value.last_created_at) &&
    (value.last_published_at === undefined || value.last_published_at === null || isUtcTimestamp(value.last_published_at)) &&
    isUtcTimestamp(value.created_at) &&
    isUtcTimestamp(value.updated_at)
  );
}

function isUser(value: unknown): value is UserSummary {
  if (
    !isRecord(value) ||
    [
      "email",
      "phone",
      "mobile",
      "subscription",
      "wallet",
      "ledger",
      "prompt",
      "prompt_text",
      "greeting",
      "content_json",
    ].some((key) => key in value)
  ) return false;
  return (
    hasString(value, "platform_user_id") &&
    hasString(value, "display_name") &&
    hasString(value, "masked_login_identifier") &&
    (value.membership_status === "active" || value.membership_status === "disabled") &&
    isOptionalNullableString(value.profile_id) &&
    isOptionalNullableString(value.profile_handle) &&
    typeof value.is_creator === "boolean" &&
    isNonNegativeInteger(value.work_count) &&
    isNonNegativeInteger(value.character_count) &&
    (value.last_activity_at === undefined || value.last_activity_at === null || isUtcTimestamp(value.last_activity_at)) &&
    isUtcTimestamp(value.created_at) &&
    isUtcTimestamp(value.updated_at)
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

function isOverviewData(value: unknown): value is OverviewData {
  if (
    !isRecord(value) ||
    ["subscription", "wallet", "ledger", "audit", "moderation", "official"].some((key) => key in value)
  ) return false;
  return isNonNegativeInteger(value.active_membership_count) &&
    isNonNegativeInteger(value.active_public_character_count) &&
    isNonNegativeInteger(value.creator_count) &&
    isNonNegativeInteger(value.works_updated_last_7_days) &&
    isUtcTimestamp(value.window_started_at) &&
    isUtcTimestamp(value.generated_at) &&
    String(value.window_started_at) < String(value.generated_at);
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
export const parseCreatorListResponse = (value: unknown) => parseTypedList("creator", value, isCreator);
export const parseCreatorResponse = (value: unknown) => parseSingle("creator", value, isCreator);
export const parseUserListResponse = (value: unknown) => parseTypedList("user", value, isUser);
export const parseUserResponse = (value: unknown) => parseSingle("user", value, isUser);
export function parseOverviewResponse(value: unknown): OverviewResponse {
  if (
    !isRecord(value) ||
    !isOverviewData(value.data) ||
    !isRecord(value.meta) ||
    value.meta.timezone !== "Asia/Shanghai" ||
    !isResponseMeta(value.meta)
  ) {
    throw new TypeError("Invalid overview response payload");
  }
  return value as OverviewResponse;
}

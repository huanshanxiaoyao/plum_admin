export type AdminListSection = "characters" | "creators" | "users" | "subscriptions";

export type PageInfo = {
  limit: number;
  next_cursor: string | null;
  has_more: boolean;
};

export type ListResponse<T> = {
  data: T[];
  page: PageInfo;
  meta: { request_id: string };
};

export type CharacterSummary = {
  id: string;
  display_name: string;
  source: "official" | "ugc";
  creator: {
    platform_user_id: string;
    display_name: string;
  };
  status: "active" | "takedown";
  content_rating: "general" | "mature";
  visibility: "public" | "private";
  updated_at: string;
};

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
  wallet_balance_coins: number;
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
  wallet_balance_coins: number;
  updated_at: string;
};

export type AdminListResourceMap = {
  characters: CharacterSummary;
  creators: CreatorSummary;
  users: UserSummary;
  subscriptions: SubscriptionSummary;
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

function isCharacter(value: unknown): value is CharacterSummary {
  if (!isRecord(value) || !isRecord(value.creator)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "display_name") &&
    (value.source === "official" || value.source === "ugc") &&
    hasString(value.creator, "platform_user_id") &&
    hasString(value.creator, "display_name") &&
    (value.status === "active" || value.status === "takedown") &&
    (value.content_rating === "general" || value.content_rating === "mature") &&
    (value.visibility === "public" || value.visibility === "private") &&
    hasString(value, "updated_at")
  );
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
    hasNumber(value, "wallet_balance_coins") &&
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
    hasNumber(value, "wallet_balance_coins") &&
    hasString(value, "updated_at")
  );
}

const ITEM_GUARDS = {
  characters: isCharacter,
  creators: isCreator,
  users: isUser,
  subscriptions: isSubscription,
} as const;

export function parseListResponse<Section extends AdminListSection>(
  section: Section,
  value: unknown,
): AdminListResponseMap[Section] {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.page) || !isRecord(value.meta)) {
    throw new TypeError(`Invalid ${section} list response envelope`);
  }
  if (
    !hasNumber(value.page, "limit") ||
    !isNullableString(value.page.next_cursor) ||
    typeof value.page.has_more !== "boolean" ||
    !hasString(value.meta, "request_id") ||
    !value.data.every(ITEM_GUARDS[section])
  ) {
    throw new TypeError(`Invalid ${section} list response payload`);
  }
  return value as AdminListResponseMap[Section];
}

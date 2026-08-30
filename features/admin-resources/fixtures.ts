import type {
  AdminListResourceMap,
  AdminListResponseMap,
  AdminListSection,
  CharacterListQuery,
  CharacterVersion,
  CharacterVersionListQuery,
  CharacterVersionListResponse,
  ListResponse,
  SingleResponse,
  WorkListQuery,
  WorkListResponse,
  WorkSummary,
} from "./contracts.ts";

const CHARACTERS: AdminListResourceMap["characters"][] = [
  {
    id: "char_accept_official_active",
    work_id: "work_accept_official_active",
    display_name: "Ada",
    source: "official",
    creator: { platform_user_id: "pusr_accept_official", profile_id: "profile_accept_official", display_name: "Plum Official" },
    status: "active",
    content_rating: "general",
    visibility: "public",
    content_version: 3,
    prompt_version: 2,
    created_at: "2026-08-21T03:15:42.123Z",
    updated_at: "2026-08-28T03:15:42.123Z",
    published_at: "2026-08-22T03:15:42.123Z",
    stats: { interaction_count: 12840, like_count: 963, favorite_count: 411 },
  },
  {
    id: "char_accept_ugc_general",
    work_id: "work_accept_ugc_general",
    display_name: "Sol",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", profile_id: "profile_accept_creator_active", display_name: "Mira Studio" },
    status: "active",
    content_rating: "general",
    visibility: "public",
    content_version: 2,
    prompt_version: 1,
    created_at: "2026-08-20T09:20:00.000Z",
    updated_at: "2026-08-27T09:20:00.000Z",
    published_at: "2026-08-21T09:20:00.000Z",
    stats: { interaction_count: 2480, like_count: 311, favorite_count: 102 },
  },
  {
    id: "char_accept_ugc_mature",
    work_id: "work_accept_ugc_mature",
    display_name: "Vale",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", profile_id: "profile_accept_creator_active", display_name: "Mira Studio" },
    status: "active",
    content_rating: "mature",
    visibility: "public",
    content_version: 1,
    prompt_version: 1,
    created_at: "2026-08-19T12:10:00.000Z",
    updated_at: "2026-08-26T12:10:00.000Z",
    published_at: "2026-08-20T12:10:00.000Z",
    stats: { interaction_count: 930, like_count: 84, favorite_count: 39 },
  },
  {
    id: "char_accept_ugc_takedown",
    work_id: "work_accept_ugc_takedown",
    display_name: "Ember",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", profile_id: "profile_accept_creator_active", display_name: "Mira Studio" },
    status: "takedown",
    content_rating: "general",
    visibility: "public",
    content_version: 4,
    prompt_version: 2,
    created_at: "2026-08-18T06:30:00.000Z",
    updated_at: "2026-08-25T06:30:00.000Z",
    published_at: "2026-08-19T06:30:00.000Z",
    stats: { interaction_count: 530, like_count: 21, favorite_count: 11 },
  },
  {
    id: "char_accept_private",
    work_id: "work_accept_private",
    display_name: "Ione",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", profile_id: "profile_accept_creator_active", display_name: "Mira Studio" },
    status: "active",
    content_rating: "general",
    visibility: "private",
    content_version: 1,
    prompt_version: 1,
    created_at: "2026-08-17T02:45:00.000Z",
    updated_at: "2026-08-24T02:45:00.000Z",
    published_at: null,
    stats: { interaction_count: 0, like_count: 0, favorite_count: 0 },
  },
];

const WORKS: WorkSummary[] = CHARACTERS.map((character) => ({
  id: character.work_id,
  display_name: character.display_name,
  source: character.source,
  owner: character.creator,
  lifecycle_status: character.status === "archived" ? "archived" : "active",
  state: character.visibility === "private" ? "draft" : "published",
  moderation: character.status === "takedown" ? "rejected" : character.visibility === "private" ? "not_submitted" : "approved",
  revision: character.content_version,
  published_character_id: character.visibility === "private" ? null : character.id,
  submitted_at: character.visibility === "private" ? null : character.created_at,
  reviewed_at: character.visibility === "private" ? null : character.published_at,
  created_at: character.created_at,
  updated_at: character.updated_at,
}));

WORKS.push({
  id: "work_accept_pending",
  display_name: "Haru",
  source: "ugc",
  owner: { platform_user_id: "pusr_accept_creator_restricted", profile_id: "profile_accept_creator_restricted", display_name: "North Window" },
  lifecycle_status: "active",
  state: "draft",
  moderation: "pending_review",
  revision: 2,
  published_character_id: null,
  submitted_at: "2026-08-29T08:00:00.000Z",
  reviewed_at: null,
  created_at: "2026-08-28T07:00:00.000Z",
  updated_at: "2026-08-29T08:00:00.000Z",
});

const CHARACTER_VERSIONS: Record<string, CharacterVersion[]> = Object.fromEntries(
  CHARACTERS.map((character) => [
    character.id,
    Array.from({ length: character.content_version }, (_, index) => ({
      character_id: character.id,
      version_number: character.content_version - index,
      prompt_version: character.prompt_version,
      display_name: character.display_name,
      creator_declared_rating: character.content_rating,
      platform_effective_rating: character.content_rating,
      access_policy_version: "2026-08",
      visibility: character.visibility,
      moderation_decision_id: character.status === "takedown" ? "decision_accept_takedown" : null,
      created_at: character.updated_at,
    })),
  ]),
);

const CREATORS: AdminListResourceMap["creators"][] = [
  {
    platform_user_id: "pusr_accept_official",
    profile_id: "profile_accept_official",
    display_name: "Plum Official",
    control_status: "active",
    draft_count: 1,
    published_count: 1,
    takedown_count: 0,
    last_created_at: "2026-08-28T03:15:42.123Z",
  },
  {
    platform_user_id: "pusr_accept_creator_active",
    profile_id: "profile_accept_creator_active",
    display_name: "Mira Studio",
    control_status: "active",
    draft_count: 1,
    published_count: 2,
    takedown_count: 1,
    last_created_at: "2026-08-27T09:20:00.000Z",
  },
  {
    platform_user_id: "pusr_accept_creator_restricted",
    profile_id: "profile_accept_creator_restricted",
    display_name: "North Window",
    control_status: "restricted",
    draft_count: 1,
    published_count: 0,
    takedown_count: 0,
    last_created_at: "2026-08-23T10:00:00.000Z",
  },
];

const USERS: AdminListResourceMap["users"][] = [
  ["pusr_accept_official", "Plum Official", "o***@users.invalid", "active", "free", "active", 2],
  ["pusr_accept_creator_active", "Mira Studio", "c***@users.invalid", "active", "standard", "active", 4],
  ["pusr_accept_creator_restricted", "North Window", "n***@users.invalid", "active", "premium", "active", 1],
  ["pusr_accept_member_free", "Rowan", "m***@users.invalid", "active", "free", "active", 0],
  ["pusr_accept_member_disabled", "Jules", "j***@users.invalid", "disabled", "free", "active", 0],
  ["pusr_accept_subscription_cancelled", "Sage", "s***@users.invalid", "active", "premium", "cancelled", 0],
].map(([platform_user_id, display_name, masked_login, membership_status, plan, status, characters], index) => ({
  platform_user_id,
  display_name,
  masked_login,
  membership_status,
  subscription: { plan, status, billing_connected: false },
  character_count: characters,
  last_active_at: index === 4 ? null : `2026-08-${String(28 - index).padStart(2, "0")}T04:00:00.000Z`,
})) as AdminListResourceMap["users"][];

const SUBSCRIPTIONS: AdminListResourceMap["subscriptions"][] = USERS.map((user, index) => ({
  id: `sub_accept_${String(index + 1).padStart(2, "0")}`,
  platform_user_id: user.platform_user_id,
  display_name: user.display_name,
  ...user.subscription,
  updated_at: `2026-08-${String(28 - index).padStart(2, "0")}T01:00:00.000Z`,
}));

const STAFF: AdminListResourceMap["staff"][] = [
  {
    open_id: "ou_accept_admin",
    union_id: "on_accept_admin",
    tenant_key: "tenant_acceptance",
    display_name: "Jack",
    en_name: "Jack",
    email: null,
    avatar_url: null,
    role: "admin",
    status: "active",
    created_at: "2026-08-28T03:15:42.123Z",
    last_login_at: "2026-08-30T02:15:42.123Z",
    updated_at: "2026-08-30T02:15:42.123Z",
  },
  {
    open_id: "ou_accept_operator",
    union_id: "on_accept_operator",
    tenant_key: "tenant_acceptance",
    display_name: "运营同学",
    en_name: null,
    email: null,
    avatar_url: null,
    role: "operator",
    status: "active",
    created_at: "2026-08-29T03:15:42.123Z",
    last_login_at: "2026-08-30T01:12:00.000Z",
    updated_at: "2026-08-30T01:12:00.000Z",
  },
  {
    open_id: "ou_accept_disabled",
    union_id: "on_accept_disabled",
    tenant_key: "tenant_acceptance",
    display_name: "已停用成员",
    en_name: null,
    email: null,
    avatar_url: null,
    role: "operator",
    status: "disabled",
    created_at: "2026-08-27T03:15:42.123Z",
    last_login_at: "2026-08-29T08:00:00.000Z",
    updated_at: "2026-08-30T00:30:00.000Z",
  },
];

export const ADMIN_FIXTURES: { [Section in AdminListSection]: AdminListResourceMap[Section][] } = {
  characters: CHARACTERS,
  creators: CREATORS,
  users: USERS,
  subscriptions: SUBSCRIPTIONS,
  staff: STAFF,
};

export function fixtureList<Section extends AdminListSection>(
  section: Section,
  query: { q?: string; status?: string; limit: number },
): AdminListResponseMap[Section] {
  const search = query.q?.trim().toLocaleLowerCase();
  const filtered = ADMIN_FIXTURES[section].filter((item) => {
    const values = Object.values(item as Record<string, unknown>);
    const matchesSearch = !search || values.some((value) => JSON.stringify(value).toLocaleLowerCase().includes(search));
    const resourceStatus =
      "status" in item ? item.status : "control_status" in item ? item.control_status : item.membership_status;
    return matchesSearch && (!query.status || resourceStatus === query.status);
  });
  const data = filtered.slice(0, query.limit) as AdminListResponseMap[Section]["data"];
  return {
    data,
    page: { limit: query.limit, next_cursor: null, has_more: false },
    meta: {
      request_id: "00000000-0000-4000-8000-000000000001",
      ...(section === "staff" ? { count: filtered.length } : {}),
    },
  } as AdminListResponseMap[Section];
}

function fixturePage<T>(items: T[], limit: number, cursor?: string): ListResponse<T> {
  const offset = cursor?.startsWith("fixture-") ? Number(cursor.slice(8)) : 0;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const data = items.slice(safeOffset, safeOffset + limit);
  const nextOffset = safeOffset + data.length;
  const hasMore = nextOffset < items.length;
  return {
    data,
    page: { limit, has_more: hasMore, next_cursor: hasMore ? `fixture-${nextOffset}` : null },
    meta: { request_id: "00000000-0000-4000-8000-000000000001" },
  };
}

function includesSearch(item: unknown, q?: string): boolean {
  return !q || JSON.stringify(item).toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
}

function sortByDate<T extends { created_at: string; updated_at?: string }>(items: T[], sort: string): T[] {
  const [field, direction] = sort.split(".") as ["created_at" | "updated_at", "asc" | "desc"];
  return [...items].sort((left, right) => {
    const result = (left[field] ?? left.created_at).localeCompare(right[field] ?? right.created_at);
    return direction === "asc" ? result : -result;
  });
}

export function fixtureCharacterList(query: CharacterListQuery): ListResponse<AdminListResourceMap["characters"]> {
  const limit = query.limit ?? 50;
  const filtered = CHARACTERS.filter((item) =>
    includesSearch(item, query.q) &&
    (!query.status || item.status === query.status) &&
    (!query.rating || item.content_rating === query.rating) &&
    (!query.visibility || item.visibility === query.visibility) &&
    (!query.source || item.source === query.source));
  return fixturePage(sortByDate(filtered, query.sort ?? "created_at.desc"), limit, query.cursor);
}

export function fixtureWorkList(query: WorkListQuery): WorkListResponse {
  const limit = query.limit ?? 50;
  const owner = query.owner?.trim().toLocaleLowerCase();
  const filtered = WORKS.filter((item) =>
    includesSearch(item, query.q) &&
    (!owner || JSON.stringify(item.owner).toLocaleLowerCase().includes(owner)) &&
    (!query.state || item.state === query.state) &&
    (!query.moderation || item.moderation === query.moderation));
  return fixturePage(sortByDate(filtered, query.sort ?? "updated_at.desc"), limit, query.cursor);
}

export function fixtureCharacter(id: string): SingleResponse<AdminListResourceMap["characters"]> | null {
  const character = CHARACTERS.find((item) => item.id === id);
  return character ? { data: character, meta: { request_id: "00000000-0000-4000-8000-000000000001" } } : null;
}

export function fixtureCharacterVersions(id: string, query: CharacterVersionListQuery): CharacterVersionListResponse {
  const versions = sortByDate(CHARACTER_VERSIONS[id] ?? [], query.sort ?? "created_at.desc");
  return fixturePage(versions, query.limit ?? 50, query.cursor);
}

export function fixtureWork(id: string): SingleResponse<WorkSummary> | null {
  const work = WORKS.find((item) => item.id === id);
  return work ? { data: work, meta: { request_id: "00000000-0000-4000-8000-000000000001" } } : null;
}

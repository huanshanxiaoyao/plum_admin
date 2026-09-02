import type {
  AdminListResourceMap,
  AdminListResponseMap,
  AdminListSection,
  CharacterListQuery,
  CharacterVersion,
  CharacterVersionListQuery,
  CharacterVersionListResponse,
  CreatorListQuery,
  CreatorSummary,
  ListResponse,
  ModerationBacklogResponse,
  ModerationReviewDetail,
  ModerationReviewDetailResponse,
  ModerationReviewListQuery,
  ModerationReviewSummary,
  OverviewResponse,
  SingleResponse,
  UserListQuery,
  UserSummary,
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

// 已发布但被 hold 扣住：有 published_character_id，却不是 approved。fixture 里必须存在
// 这种行，否则后台永远看不到这个状态，运行时校验也拿不到反例。
WORKS.push({
  id: "work_accept_held",
  display_name: "Nyx",
  source: "ugc",
  owner: { platform_user_id: "pusr_accept_creator_active", profile_id: "profile_accept_creator_active", display_name: "Mira Studio" },
  lifecycle_status: "active",
  state: "published",
  moderation: "published_pending_review",
  revision: 2,
  published_character_id: "char_accept_ugc_general",
  submitted_at: "2026-09-01T02:05:00.000Z",
  reviewed_at: null,
  created_at: "2026-08-20T09:00:00.000Z",
  updated_at: "2026-09-01T02:10:00.000Z",
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
    handle: "plum-official",
    profile_status: "active",
    control_status: "active",
    work_count: 2,
    draft_count: 1,
    published_count: 1,
    rejected_count: 0,
    takedown_count: 0,
    interaction_count: 12840,
    like_count: 963,
    favorite_count: 411,
    last_created_at: "2026-08-28T03:15:42.123Z",
    last_published_at: "2026-08-22T03:15:42.123Z",
    created_at: "2026-08-14T03:15:42.123Z",
    updated_at: "2026-08-28T03:15:42.123Z",
  },
  {
    platform_user_id: "pusr_accept_creator_active",
    profile_id: "profile_accept_creator_active",
    display_name: "Mira Studio",
    handle: "mira-studio-accept",
    profile_status: "active",
    control_status: "active",
    work_count: 5,
    draft_count: 1,
    published_count: 2,
    rejected_count: 0,
    takedown_count: 1,
    interaction_count: 2100,
    like_count: 260,
    favorite_count: 95,
    last_created_at: "2026-08-27T09:20:00.000Z",
    last_published_at: "2026-08-21T09:20:00.000Z",
    created_at: "2026-08-15T09:20:00.000Z",
    updated_at: "2026-08-27T09:20:00.000Z",
  },
  {
    platform_user_id: "pusr_accept_creator_restricted",
    profile_id: "profile_accept_creator_restricted",
    display_name: "North Window",
    handle: "north-window-accept",
    profile_status: "active",
    control_status: "restricted",
    work_count: 1,
    draft_count: 1,
    published_count: 0,
    rejected_count: 1,
    takedown_count: 0,
    interaction_count: 0,
    like_count: 0,
    favorite_count: 0,
    last_created_at: "2026-08-23T10:00:00.000Z",
    last_published_at: null,
    created_at: "2026-08-15T10:00:00.000Z",
    updated_at: "2026-08-29T08:00:00.000Z",
  },
];

const USERS: AdminListResourceMap["users"][] = [
  ["pusr_accept_official", "Plum Official", "o***@users.invalid", "active", "profile_accept_official", "plum-official", true, 2, 2],
  ["pusr_accept_creator_active", "Mira Studio", "c***@users.invalid", "active", "profile_accept_creator_active", "mira-studio-accept", true, 5, 4],
  ["pusr_accept_creator_restricted", "North Window", "138****8000", "active", "profile_accept_creator_restricted", "north-window-accept", true, 1, 1],
  ["pusr_accept_member_free", "Rowan", "m***@users.invalid", "active", null, null, false, 0, 0],
  ["pusr_accept_member_disabled", "Jules", "j***@users.invalid", "disabled", null, null, false, 0, 0],
  ["pusr_accept_subscription_cancelled", "Sage", "s***@users.invalid", "active", null, null, false, 0, 0],
].map(([platform_user_id, display_name, masked_login_identifier, membership_status, profile_id, profile_handle, is_creator, work_count, character_count], index) => ({
  platform_user_id,
  display_name,
  masked_login_identifier,
  membership_status,
  profile_id,
  profile_handle,
  is_creator,
  work_count,
  character_count,
  last_activity_at: index === 4 ? null : `2026-08-${String(28 - index).padStart(2, "0")}T04:00:00.000Z`,
  created_at: `2026-08-${String(14 + index).padStart(2, "0")}T03:00:00.000Z`,
  updated_at: `2026-08-${String(28 - index).padStart(2, "0")}T05:00:00.000Z`,
})) as AdminListResourceMap["users"][];

const SUBSCRIPTIONS: AdminListResourceMap["subscriptions"][] = [
  ["pusr_accept_official", "Plum Official", "free", "active"],
  ["pusr_accept_creator_active", "Mira Studio", "standard", "active"],
  ["pusr_accept_creator_restricted", "North Window", "premium", "active"],
  ["pusr_accept_member_free", "Rowan", "free", "active"],
  ["pusr_accept_member_disabled", "Jules", "free", "active"],
  ["pusr_accept_subscription_cancelled", "Sage", "premium", "cancelled"],
].map(([platform_user_id, display_name, plan, status], index) => ({
  id: `sub_accept_${String(index + 1).padStart(2, "0")}`,
  platform_user_id,
  display_name,
  plan,
  status,
  billing_connected: false,
  updated_at: `2026-08-${String(28 - index).padStart(2, "0")}T01:00:00.000Z`,
})) as AdminListResourceMap["subscriptions"][];

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

const MODERATION_REVIEW_CONTENT: Record<string, ModerationReviewDetail["content"]> = {
  rev_accept_pending: {
    display_name: "Nyx",
    intro: "A night-shift paramedic who keeps a running list of everyone she could not save.",
    opening_scene: "The ambulance bay is empty. She is still in scrubs, staring at the sodium lights.",
    character_settings: "Blunt, exhausted, allergic to reassurance. Talks about triage the way other people talk about weather.",
    example_dialogues: "User: Rough night?\nNyx: They are all rough. Some of them just end quieter.",
    response_rules: "Never romanticise injury. Refuse medical advice and say so plainly.",
  },
  rev_accept_reviewing: {
    display_name: "Kestrel",
    intro: "A retired blade dancer running a teahouse at the edge of a border town.",
    opening_scene: "Steam curls off the pot. Two cups are set out although nobody else was invited.",
    character_settings: "Warm on the surface, unreadable underneath. Answers questions with questions.",
    example_dialogues: "User: Who is the second cup for?\nKestrel: Whoever sits down before it goes cold.",
    response_rules: "Keep violence off-screen. Do not describe wounds.",
  },
  rev_accept_released: {
    display_name: "Juniper",
    intro: "A botanist cataloguing plants that only bloom after a wildfire.",
    opening_scene: "Ash still warm underfoot. She is on her knees with a hand lens.",
    character_settings: "Patient, precise, quietly funny about how slow her work is.",
    example_dialogues: "User: Anything alive out here?\nJuniper: Give it a season. Fire is not the end of the story.",
    response_rules: "Stay factual about ecology. No survivalist instructions.",
  },
  rev_accept_confined: {
    display_name: "Marrow",
    intro: "A rooftop fixer who trades favours nobody wants written down.",
    opening_scene: "The city hums below. He is counting something and does not look up.",
    character_settings: "Amoral, transactional, allergic to names.",
    example_dialogues: "User: What do you want?\nMarrow: Nothing you would miss. Yet.",
    response_rules: "Refuse anything operational or illegal, however it is framed.",
  },
  rev_accept_purged: {
    display_name: "",
    intro: "",
    opening_scene: "",
    character_settings: "",
    example_dialogues: "",
    response_rules: "",
  },
};

const MODERATION_REVIEWS: ModerationReviewSummary[] = [
  {
    id: "rev_accept_pending",
    character_id: "char_accept_ugc_general",
    work_id: "work_accept_ugc_general",
    version_number: 2,
    display_name: "Nyx",
    owner_platform_user_id: "pusr_accept_creator_active",
    status: "pending",
    trigger_source: "machine_needs_review",
    risk_level: "medium",
    machine_labels: ["violence_description", "self_harm_reference"],
    character_status: "active",
    moderation_hold: "pending",
    visibility: "private",
    assigned_admin_open_id: null,
    decided_by_open_id: null,
    decided_at: null,
    reason_code: null,
    created_at: "2026-09-01T02:10:00.000Z",
    updated_at: "2026-09-01T02:10:00.000Z",
  },
  {
    id: "rev_accept_reviewing",
    character_id: "char_accept_ugc_mature",
    work_id: "work_accept_ugc_mature",
    version_number: 1,
    display_name: "Kestrel",
    owner_platform_user_id: "pusr_accept_creator_active",
    status: "reviewing",
    trigger_source: "machine_needs_review",
    risk_level: "low",
    machine_labels: ["weapon_reference"],
    character_status: "active",
    moderation_hold: "pending",
    visibility: "private",
    assigned_admin_open_id: "ou_accept_operator",
    decided_by_open_id: null,
    decided_at: null,
    reason_code: null,
    created_at: "2026-09-01T05:40:00.000Z",
    updated_at: "2026-09-01T06:05:00.000Z",
  },
  {
    id: "rev_accept_released",
    character_id: "char_accept_official_active",
    work_id: "work_accept_official_active",
    version_number: 3,
    display_name: "Juniper",
    owner_platform_user_id: "pusr_accept_official",
    status: "released",
    trigger_source: "machine_needs_review",
    risk_level: "low",
    machine_labels: ["disaster_reference"],
    character_status: "active",
    moderation_hold: "none",
    visibility: "public",
    assigned_admin_open_id: "ou_accept_operator",
    decided_by_open_id: "ou_accept_operator",
    decided_at: "2026-08-31T08:20:00.000Z",
    reason_code: null,
    created_at: "2026-08-31T07:00:00.000Z",
    updated_at: "2026-08-31T08:20:00.000Z",
  },
  {
    id: "rev_accept_confined",
    character_id: "char_accept_ugc_takedown",
    work_id: "work_accept_ugc_takedown",
    version_number: 1,
    display_name: "Marrow",
    owner_platform_user_id: "pusr_accept_creator_restricted",
    status: "confined",
    trigger_source: "machine_needs_review",
    risk_level: "high",
    machine_labels: ["criminal_facilitation", "violence_description"],
    character_status: "active",
    moderation_hold: "confined",
    visibility: "private",
    assigned_admin_open_id: "ou_accept_admin",
    decided_by_open_id: "ou_accept_admin",
    decided_at: "2026-08-30T11:45:00.000Z",
    reason_code: "criminal_facilitation",
    created_at: "2026-08-30T10:05:00.000Z",
    updated_at: "2026-08-30T11:45:00.000Z",
  },
  {
    id: "rev_accept_purged",
    character_id: "char_accept_ugc_purged",
    work_id: "work_accept_ugc_purged",
    version_number: 1,
    display_name: "(已清除)",
    owner_platform_user_id: "pusr_accept_creator_restricted",
    status: "purged",
    trigger_source: "machine_needs_review",
    risk_level: "high",
    machine_labels: ["minor_sexualization"],
    character_status: "takedown",
    moderation_hold: "confined",
    visibility: "private",
    assigned_admin_open_id: "ou_accept_admin",
    decided_by_open_id: "ou_accept_admin",
    decided_at: "2026-08-29T14:30:00.000Z",
    reason_code: "minor_sexualization",
    created_at: "2026-08-29T13:55:00.000Z",
    updated_at: "2026-08-29T14:30:00.000Z",
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

function creatorDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value;
}

export function fixtureCreatorList(query: CreatorListQuery): ListResponse<CreatorSummary> {
  const filtered = CREATORS.filter((item) =>
    includesSearch(item, query.q) &&
    (!query.status || item.control_status === query.status) &&
    (!query.from || creatorDate(item.created_at) >= creatorDate(query.from)) &&
    (!query.to || creatorDate(item.created_at) < creatorDate(query.to)));
  const sortField = query.sort === "created_at.desc" ? "created_at" : "last_created_at";
  const sorted = [...filtered].sort((left, right) =>
    right[sortField].localeCompare(left[sortField]) || right.platform_user_id.localeCompare(left.platform_user_id));
  return fixturePage(sorted, query.limit ?? 50, query.cursor);
}

export function fixtureCreator(platformUserId: string): SingleResponse<CreatorSummary> | null {
  const creator = CREATORS.find((item) => item.platform_user_id === platformUserId);
  return creator ? { data: creator, meta: { request_id: "00000000-0000-4000-8000-000000000001" } } : null;
}

export function fixtureUserList(query: UserListQuery): ListResponse<UserSummary> {
  const from = query.created_from?.slice(0, 10);
  const to = query.created_to?.slice(0, 10);
  const filtered = USERS.filter((item) =>
    includesSearch(item, query.q) &&
    (!query.status || item.membership_status === query.status) &&
    (!from || item.created_at.slice(0, 10) >= from) &&
    (!to || item.created_at.slice(0, 10) < to));
  const sorted = [...filtered].sort((left, right) => {
    const leftValue = query.sort === "created_at.desc" ? left.created_at : left.last_activity_at ?? "";
    const rightValue = query.sort === "created_at.desc" ? right.created_at : right.last_activity_at ?? "";
    return rightValue.localeCompare(leftValue) || right.platform_user_id.localeCompare(left.platform_user_id);
  });
  return fixturePage(sorted, query.limit ?? 50, query.cursor);
}

export function fixtureUser(platformUserId: string): SingleResponse<UserSummary> | null {
  const user = USERS.find((item) => item.platform_user_id === platformUserId);
  return user ? { data: user, meta: { request_id: "00000000-0000-4000-8000-000000000001" } } : null;
}

export function fixtureOverview(): OverviewResponse {
  const generatedAt = "2026-08-31T12:00:00.000Z";
  const windowStartedAt = "2026-08-24T12:00:00.000Z";
  return {
    data: {
      active_membership_count: USERS.filter((item) => item.membership_status === "active").length,
      active_public_character_count: CHARACTERS.filter(
        (item) => item.status === "active" && item.visibility === "public",
      ).length,
      creator_count: CREATORS.length,
      works_updated_last_7_days: WORKS.filter(
        (item) => item.updated_at >= windowStartedAt && item.updated_at < generatedAt,
      ).length,
      window_started_at: windowStartedAt,
      generated_at: generatedAt,
    },
    meta: {
      request_id: "00000000-0000-4000-8000-000000000001",
      timezone: "Asia/Shanghai",
    },
  };
}

export function fixtureModerationReviewList(query: ModerationReviewListQuery): ListResponse<ModerationReviewSummary> {
  const risk = query.risk_level?.trim().toLocaleLowerCase();
  const filtered = MODERATION_REVIEWS.filter((item) =>
    (!query.status || item.status === query.status) &&
    (!risk || item.risk_level === risk));
  return fixturePage(sortByDate(filtered, query.sort ?? "created_at.asc"), query.limit ?? 50, query.cursor);
}

export function fixtureModerationReview(reviewId: string): ModerationReviewDetailResponse | null {
  const review = MODERATION_REVIEWS.find((item) => item.id === reviewId);
  const content = MODERATION_REVIEW_CONTENT[reviewId];
  if (!review || !content) return null;
  return {
    data: { ...review, note: null, content },
    meta: { request_id: "00000000-0000-4000-8000-000000000001" },
    plaintext: true,
  };
}

export function fixtureModerationBacklog(): ModerationBacklogResponse {
  const open = MODERATION_REVIEWS.filter((item) => item.status === "pending" || item.status === "reviewing");
  const oldest = [...open].sort((left, right) => left.created_at.localeCompare(right.created_at))[0];
  return {
    data: {
      open_count: open.length,
      pending_count: open.filter((item) => item.status === "pending").length,
      oldest_created_at: oldest?.created_at ?? null,
    },
    meta: { request_id: "00000000-0000-4000-8000-000000000001" },
  };
}

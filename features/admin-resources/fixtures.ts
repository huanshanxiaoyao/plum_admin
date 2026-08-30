import type {
  AdminListResourceMap,
  AdminListResponseMap,
  AdminListSection,
} from "./contracts.ts";

const CHARACTERS: AdminListResourceMap["characters"][] = [
  {
    id: "char_accept_official_active",
    display_name: "Ada",
    source: "official",
    creator: { platform_user_id: "pusr_accept_official", display_name: "Plum Official" },
    status: "active",
    content_rating: "general",
    visibility: "public",
    updated_at: "2026-08-28T03:15:42.123Z",
  },
  {
    id: "char_accept_ugc_general",
    display_name: "Sol",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", display_name: "Mira Studio" },
    status: "active",
    content_rating: "general",
    visibility: "public",
    updated_at: "2026-08-27T09:20:00.000Z",
  },
  {
    id: "char_accept_ugc_mature",
    display_name: "Vale",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", display_name: "Mira Studio" },
    status: "active",
    content_rating: "mature",
    visibility: "public",
    updated_at: "2026-08-26T12:10:00.000Z",
  },
  {
    id: "char_accept_ugc_takedown",
    display_name: "Ember",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", display_name: "Mira Studio" },
    status: "takedown",
    content_rating: "general",
    visibility: "public",
    updated_at: "2026-08-25T06:30:00.000Z",
  },
  {
    id: "char_accept_private",
    display_name: "Ione",
    source: "ugc",
    creator: { platform_user_id: "pusr_accept_creator_active", display_name: "Mira Studio" },
    status: "active",
    content_rating: "general",
    visibility: "private",
    updated_at: "2026-08-24T02:45:00.000Z",
  },
];

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
    meta: { request_id: "00000000-0000-4000-8000-000000000001" },
  } as AdminListResponseMap[Section];
}

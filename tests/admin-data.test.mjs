import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCharacterListResponse,
  parseCharacterResponse,
  parseCharacterVersionListResponse,
  parseCrystalGrantResponse,
  parseCreatorListResponse,
  parseCreatorResponse,
  parseListResponse,
  parseModerationBacklogResponse,
  parseModerationReviewDetailResponse,
  parseModerationReviewListResponse,
  parseUserListResponse,
  parseUserResponse,
  parseUserWalletResponse,
  parseWorkListResponse,
  parseWorkResponse,
  parseOverviewResponse,
} from "../features/admin-resources/contracts.ts";
import {
  fixtureCharacter,
  fixtureCharacterList,
  fixtureCharacterVersions,
  fixtureCreator,
  fixtureCreatorList,
  fixtureList,
  fixtureModerationBacklog,
  fixtureModerationReview,
  fixtureModerationReviewList,
  fixtureUser,
  fixtureUserList,
  fixtureUserWallet,
  fixtureWork,
  fixtureWorkList,
  fixtureOverview,
} from "../features/admin-resources/fixtures.ts";
import {
  adminApiOrigin,
  adminApiWritesEnabled,
  adminDataSourceMode,
} from "../lib/bff/config.ts";

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("acceptance fixtures support deterministic search and status filters", () => {
  const characters = fixtureList("characters", { q: "Mira Studio", limit: 50 });
  assert.deepEqual(characters.data.map((item) => item.display_name), ["Sol", "Vale", "Ember", "Ione"]);

  const takedown = fixtureList("characters", { status: "takedown", limit: 50 });
  assert.deepEqual(takedown.data.map((item) => item.id), ["char_accept_ugc_takedown"]);

  const restricted = fixtureList("creators", { status: "restricted", limit: 50 });
  assert.deepEqual(restricted.data.map((item) => item.display_name), ["North Window"]);

  const crossProduct = fixtureList("users", { q: "zhaoxi", limit: 50 });
  assert.equal(crossProduct.data.length, 0);
});

test("fixture responses satisfy the runtime API contract", () => {
  for (const section of ["characters", "creators", "users", "subscriptions", "staff"]) {
    const response = fixtureList(section, { limit: 50 });
    assert.equal(parseListResponse(section, response), response);
  }
  assert.equal(parseCharacterListResponse(fixtureCharacterList({ limit: 50 })).data.length, 5);
  assert.equal(parseCharacterResponse(fixtureCharacter("char_accept_official_active")).data.display_name, "Ada");
  assert.equal(parseCharacterVersionListResponse(fixtureCharacterVersions("char_accept_official_active", { limit: 50 })).data.length, 3);
  assert.equal(parseWorkListResponse(fixtureWorkList({ limit: 50 })).data.length, 7);
  assert.equal(parseWorkResponse(fixtureWork("work_accept_official_active")).data.display_name, "Ada");
  assert.equal(parseCreatorListResponse(fixtureCreatorList({ limit: 50 })).data.length, 3);
  assert.equal(parseCreatorResponse(fixtureCreator("pusr_accept_creator_active")).data.display_name, "Mira Studio");
  assert.equal(parseUserListResponse(fixtureUserList({ limit: 50 })).data.length, 6);
  assert.equal(parseUserResponse(fixtureUser("pusr_accept_member_free")).data.display_name, "Rowan");
  assert.equal(parseUserWalletResponse(fixtureUserWallet("pusr_accept_member_free")).data.balance, 405);
  assert.equal(fixtureUserWallet("pusr_accept_member_disabled"), null);
  assert.equal(parseOverviewResponse(fixtureOverview()).data.active_membership_count, 5);
});

test("content fixtures support compound filters and cursor pagination", () => {
  const firstPage = fixtureCharacterList({ source: "ugc", rating: "general", limit: 2 });
  assert.deepEqual(firstPage.data.map((item) => item.display_name), ["Sol", "Ember"]);
  assert.equal(firstPage.page.has_more, true);
  const secondPage = fixtureCharacterList({ source: "ugc", rating: "general", limit: 2, cursor: firstPage.page.next_cursor });
  assert.deepEqual(secondPage.data.map((item) => item.display_name), ["Ione"]);

  const works = fixtureWorkList({ owner: "North Window", moderation: "pending_review", limit: 50 });
  assert.deepEqual(works.data.map((item) => item.display_name), ["Haru"]);

  const creators = fixtureCreatorList({
    q: "studio",
    status: "active",
    from: "2026-08-15T00:00:00+08:00",
    to: "2026-08-16T00:00:00+08:00",
    limit: 50,
  });
  assert.deepEqual(creators.data.map((item) => item.display_name), ["Mira Studio"]);

  const users = fixtureUserList({
    q: "rowan",
    status: "active",
    created_from: "2026-08-17T00:00:00+08:00",
    created_to: "2026-08-18T00:00:00+08:00",
    limit: 50,
  });
  assert.deepEqual(users.data.map((item) => item.platform_user_id), ["pusr_accept_member_free"]);
});

test("runtime content contracts reject private text and draft JSON", () => {
  const character = structuredClone(fixtureCharacter("char_accept_official_active"));
  character.data.prompt_text = "must not cross the admin boundary";
  assert.throws(() => parseCharacterResponse(character), /Invalid/);

  const work = structuredClone(fixtureWork("work_accept_official_active"));
  work.data.content_json = { private: true };
  assert.throws(() => parseWorkResponse(work), /Invalid/);

  const versions = structuredClone(fixtureCharacterVersions("char_accept_official_active", { limit: 50 }));
  versions.data[0].greeting = "must not cross the admin boundary";
  assert.throws(() => parseCharacterVersionListResponse(versions), /Invalid/);

  for (const privateField of ["email", "phone", "prompt_text", "content_json"]) {
    const creator = structuredClone(fixtureCreator("pusr_accept_creator_active"));
    creator.data[privateField] = privateField === "content_json" ? { private: true } : "must not cross";
    assert.throws(() => parseCreatorResponse(creator), /Invalid/);
  }

  for (const privateField of ["email", "phone", "mobile", "subscription", "wallet", "ledger", "prompt_text", "content_json"]) {
    const user = structuredClone(fixtureUser("pusr_accept_member_free"));
    user.data[privateField] = privateField === "content_json" ? { private: true } : "must not cross";
    assert.throws(() => parseUserResponse(user), /Invalid/);
  }

  const overview = structuredClone(fixtureOverview());
  overview.data.subscription = { active: 5 };
  assert.throws(() => parseOverviewResponse(overview), /Invalid/);
});

test("runtime contract rejects malformed and payment-connected responses", () => {
  assert.throws(() => parseListResponse("characters", { data: [], page: {}, meta: {} }), /Invalid/);
  const staff = fixtureList("staff", { limit: 50 });
  const staffWithoutCount = structuredClone(staff);
  delete staffWithoutCount.meta.count;
  assert.throws(() => parseListResponse("staff", staffWithoutCount), /Invalid/);
  const subscriptions = fixtureList("subscriptions", { limit: 50 });
  const invalid = structuredClone(subscriptions);
  invalid.data[0].billing_connected = true;
  assert.throws(() => parseListResponse("subscriptions", invalid), /Invalid/);
});

test("manual crystal grant response is validated at the browser boundary", () => {
  const response = {
    data: {
      transaction_id: "tx_manual_001",
      audit_event_id: "10242",
      platform_user_id: "pusr_accept_member_free",
      amount: 500,
      amount_micros: 500_000_000,
      balance_before: 405,
      balance_after: 905,
      validity_days: 30,
      expires_at: "2026-10-05T03:10:00.000Z",
      replayed: false,
    },
    meta: { request_id: "req_manual_001" },
  };
  assert.equal(parseCrystalGrantResponse(response).data.balance_after, 905);
  const invalid = structuredClone(response);
  invalid.data.amount = 5001;
  assert.throws(() => parseCrystalGrantResponse(invalid), /Invalid/);
});

test("development defaults to fixtures and production forbids them", () => {
  withEnvironment({ NODE_ENV: "development", ADMIN_DATA_SOURCE: undefined }, () => {
    assert.equal(adminDataSourceMode(), "fixture");
  });
  withEnvironment({ NODE_ENV: "production", ADMIN_DATA_SOURCE: "fixture" }, () => {
    assert.throws(() => adminDataSourceMode(), /forbidden/);
  });
});

test("local development rejects loopback APIs and requires remote HTTPS", () => {
  withEnvironment(
    { NODE_ENV: "development", ADMIN_API_ORIGIN: "http://127.0.0.1:8180" },
    () => assert.throws(() => adminApiOrigin(), /loopback/),
  );
  withEnvironment(
    { NODE_ENV: "development", ADMIN_API_ORIGIN: "http://admin-api.example.invalid" },
    () => assert.throws(() => adminApiOrigin(), /HTTPS/),
  );
  withEnvironment(
    { NODE_ENV: "development", ADMIN_API_ORIGIN: "https://admin-api.example.invalid" },
    () => assert.equal(adminApiOrigin().origin, "https://admin-api.example.invalid"),
  );
});

test("remote writes require an explicit opt-in", () => {
  withEnvironment({ ADMIN_API_WRITE_ENABLED: undefined }, () => assert.equal(adminApiWritesEnabled(), false));
  withEnvironment({ ADMIN_API_WRITE_ENABLED: "true" }, () => assert.equal(adminApiWritesEnabled(), true));
  withEnvironment({ ADMIN_API_WRITE_ENABLED: "TRUE" }, () => assert.equal(adminApiWritesEnabled(), false));
});

test("moderation queue fixtures filter by status, risk and creation order", () => {
  const oldestFirst = fixtureModerationReviewList({ limit: 50 });
  assert.deepEqual(oldestFirst.data.map((item) => item.id), [
    "rev_accept_purged",
    "rev_accept_confined",
    "rev_accept_released",
    "rev_accept_pending",
    "rev_accept_reviewing",
  ]);

  const open = fixtureModerationReviewList({ status: "pending", limit: 50 });
  assert.deepEqual(open.data.map((item) => item.id), ["rev_accept_pending"]);

  const high = fixtureModerationReviewList({ risk_level: "high", limit: 50 });
  assert.deepEqual(high.data.map((item) => item.status), ["purged", "confined"]);

  const backlog = fixtureModerationBacklog();
  assert.equal(backlog.data.open_count, 2);
  assert.equal(backlog.data.pending_count, 1);
  assert.equal(backlog.data.oldest_created_at, "2026-09-01T02:10:00.000Z");
});

test("moderation fixtures satisfy the runtime contract", () => {
  assert.doesNotThrow(() => parseModerationReviewListResponse(fixtureModerationReviewList({ limit: 50 })));
  assert.doesNotThrow(() => parseModerationReviewDetailResponse(fixtureModerationReview("rev_accept_pending")));
  assert.doesNotThrow(() => parseModerationBacklogResponse(fixtureModerationBacklog()));
  assert.equal(fixtureModerationReview("rev_missing"), null);
});

test("moderation list projection must stay free of reviewed text", () => {
  const withContent = structuredClone(fixtureModerationReviewList({ limit: 50 }));
  withContent.data[0].content = { intro: "must not cross the queue boundary" };
  assert.throws(() => parseModerationReviewListResponse(withContent), /Invalid/);

  const flattened = structuredClone(fixtureModerationReviewList({ limit: 50 }));
  flattened.data[0].intro = "must not cross the queue boundary";
  assert.throws(() => parseModerationReviewListResponse(flattened), /Invalid/);
});

test("moderation detail is rejected unless it declares a plaintext read", () => {
  const detail = structuredClone(fixtureModerationReview("rev_accept_pending"));
  detail.plaintext = false;
  assert.throws(() => parseModerationReviewDetailResponse(detail), /Invalid/);

  const missingField = structuredClone(fixtureModerationReview("rev_accept_pending"));
  delete missingField.data.content.response_rules;
  assert.throws(() => parseModerationReviewDetailResponse(missingField), /Invalid/);

  const badStatus = structuredClone(fixtureModerationReview("rev_accept_pending"));
  badStatus.data.status = "approved";
  assert.throws(() => parseModerationReviewDetailResponse(badStatus), /Invalid/);
});

test("a published-but-held work is accepted and filterable, not treated as malformed", () => {
  // 后端把「有 Character 但被 hold 扣住」如实报成 published_pending_review。手写 guard
  // 若还停在旧四值，整份响应会被拒绝，Work 列表直接加载失败。
  const held = fixtureWorkList({ moderation: "published_pending_review", limit: 50 });
  assert.deepEqual(held.data.map((item) => item.id), ["work_accept_held"]);
  assert.equal(held.data[0].published_character_id, "char_accept_ugc_general");
  assert.doesNotThrow(() => parseWorkListResponse(held));
  assert.doesNotThrow(() => parseWorkListResponse(fixtureWorkList({ limit: 50 })));

  const bogus = structuredClone(held);
  bogus.data[0].moderation = "released";
  assert.throws(() => parseWorkListResponse(bogus), /Invalid/);
});

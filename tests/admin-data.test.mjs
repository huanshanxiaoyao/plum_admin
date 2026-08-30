import assert from "node:assert/strict";
import test from "node:test";
import { parseListResponse } from "../features/admin-resources/contracts.ts";
import { fixtureList } from "../features/admin-resources/fixtures.ts";
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
});

test("runtime contract rejects malformed and payment-connected responses", () => {
  assert.throws(() => parseListResponse("characters", { data: [], page: {}, meta: {} }), /Invalid/);
  const subscriptions = fixtureList("subscriptions", { limit: 50 });
  const invalid = structuredClone(subscriptions);
  invalid.data[0].billing_connected = true;
  assert.throws(() => parseListResponse("subscriptions", invalid), /Invalid/);
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

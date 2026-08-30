import assert from "node:assert/strict";
import test from "node:test";
import { parseBackendAdminIdentity } from "../lib/auth/identity-contract.ts";

const RESPONSE = {
  data: {
    id: "adm_accept_operator",
    email: "operator@example.com",
    display_name: "Acceptance Operator",
    role: "operator",
    status: "active",
    capabilities: ["operations.access"],
  },
  meta: { request_id: "00000000-0000-4000-8000-000000000001" },
};

test("backend identity is converted from snake case and remains capability-authoritative", () => {
  assert.deepEqual(parseBackendAdminIdentity(RESPONSE), {
    id: "adm_accept_operator",
    email: "operator@example.com",
    displayName: "Acceptance Operator",
    role: "operator",
    capabilities: ["operations.access"],
  });
});

test("disabled, unknown-role, and unknown-capability payloads are rejected", () => {
  assert.throws(
    () => parseBackendAdminIdentity({ ...RESPONSE, data: { ...RESPONSE.data, status: "disabled" } }),
    /Invalid/,
  );
  assert.throws(
    () => parseBackendAdminIdentity({ ...RESPONSE, data: { ...RESPONSE.data, role: "staff" } }),
    /Invalid/,
  );
  assert.throws(
    () => parseBackendAdminIdentity({
      ...RESPONSE,
      data: { ...RESPONSE.data, capabilities: ["operations.access", "wallet.manage"] },
    }),
    /Invalid/,
  );
});

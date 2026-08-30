import type { components as AdminApiComponents } from "../../contracts/generated/admin-api.ts";
import { CAPABILITIES, isAdminRole } from "./capabilities.ts";
import type { AdminIdentity } from "./types.ts";

type BackendAdminIdentity = AdminApiComponents["schemas"]["AdminIdentity"];
type BackendAdminIdentityResponse = AdminApiComponents["schemas"]["AdminIdentityResponse"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseBackendAdminIdentity(value: unknown): AdminIdentity {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    !isRecord(value.meta) ||
    typeof value.meta.request_id !== "string"
  ) {
    throw new TypeError("Invalid admin identity response envelope");
  }
  const data = value.data;
  const capabilities = data.capabilities;
  if (
    typeof data.id !== "string" ||
    typeof data.email !== "string" ||
    typeof data.display_name !== "string" ||
    !isAdminRole(data.role) ||
    data.status !== "active" ||
    !Array.isArray(capabilities) ||
    !capabilities.every(
      (capability): capability is AdminIdentity["capabilities"][number] =>
        typeof capability === "string" && CAPABILITIES.includes(capability as never),
    ) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new TypeError("Invalid admin identity response payload");
  }

  const parsed: BackendAdminIdentityResponse = {
    data: {
      id: data.id,
      email: data.email,
      display_name: data.display_name,
      role: data.role,
      status: data.status,
      capabilities: capabilities as BackendAdminIdentity["capabilities"],
    },
    meta: { request_id: value.meta.request_id },
  };
  return {
    id: parsed.data.id,
    email: parsed.data.email,
    displayName: parsed.data.display_name,
    role: parsed.data.role,
    capabilities: parsed.data.capabilities,
  };
}

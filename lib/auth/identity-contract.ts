import { CAPABILITIES, isAdminRole } from "./capabilities.ts";
import type { AdminIdentity } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseBackendAdminIdentity(value: unknown): AdminIdentity {
  if (!isRecord(value) || !isRecord(value.data)) {
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
  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    role: data.role,
    capabilities,
  };
}

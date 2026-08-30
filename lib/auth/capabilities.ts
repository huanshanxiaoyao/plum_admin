import type { components as AdminApiComponents } from "../../contracts/generated/admin-api.ts";

type BackendAdminIdentity = AdminApiComponents["schemas"]["AdminIdentity"];

export const CAPABILITIES = [
  "operations.access",
  "character.restore",
  "membership.manage",
  "staff.manage",
] as const satisfies readonly BackendAdminIdentity["capabilities"][number][];

export type Capability = BackendAdminIdentity["capabilities"][number];
export type AdminRole = BackendAdminIdentity["role"];

const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  operator: ["operations.access"],
  admin: CAPABILITIES,
};

export function capabilitiesForRole(role: AdminRole): readonly Capability[] {
  return ROLE_CAPABILITIES[role];
}

export function hasCapability(role: AdminRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === "operator" || value === "admin";
}

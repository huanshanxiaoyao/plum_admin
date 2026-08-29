export const CAPABILITIES = [
  "operations.access",
  "character.restore",
  "membership.manage",
  "staff.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type AdminRole = "operator" | "admin";

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

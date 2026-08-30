import type { AdminRole } from "./capabilities.ts";
import type { AdminIdentity } from "./types.ts";
import { adminAuthMode } from "./auth-mode.ts";

const MOCK_IDENTITIES: Record<AdminRole, Omit<AdminIdentity, "capabilities">> = {
  operator: {
    id: "adm_local_operator",
    email: "operator@plum-admin.invalid",
    displayName: "Local Operator",
    role: "operator",
  },
  admin: {
    id: "adm_local_admin",
    email: "admin@plum-admin.invalid",
    displayName: "Local Admin",
    role: "admin",
  },
};

export function isMockAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && adminAuthMode() === "mock";
}

export function getMockIdentity(role: AdminRole) {
  return MOCK_IDENTITIES[role];
}

import type { AdminRole, Capability } from "./capabilities.ts";

export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  capabilities: readonly Capability[];
};

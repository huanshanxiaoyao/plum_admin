import type { Capability } from "../../lib/auth/capabilities.ts";
import type { AdminDataSourceMode } from "../../lib/bff/config.ts";

export type AdminModuleKey =
  | "dashboard"
  | "characters"
  | "creators"
  | "users"
  | "subscriptions"
  | "audit"
  | "staff";

export type AdminModuleSection = Exclude<AdminModuleKey, "dashboard">;

export type AdminModule = {
  key: AdminModuleKey;
  section: AdminModuleSection | null;
  href: string;
  label: string;
  availability: "shipped" | "fixture";
  capability: Capability;
};

export const ADMIN_MODULES: readonly AdminModule[] = [
  {
    key: "dashboard",
    section: null,
    href: "/",
    label: "工作台",
    availability: "shipped",
    capability: "operations.access",
  },
  {
    key: "characters",
    section: "characters",
    href: "/characters",
    label: "角色管理",
    availability: "shipped",
    capability: "operations.access",
  },
  {
    key: "creators",
    section: "creators",
    href: "/creators",
    label: "创作者",
    availability: "shipped",
    capability: "operations.access",
  },
  {
    key: "users",
    section: "users",
    href: "/users",
    label: "用户",
    availability: "shipped",
    capability: "operations.access",
  },
  {
    key: "subscriptions",
    section: "subscriptions",
    href: "/subscriptions",
    label: "用户订阅",
    availability: "fixture",
    capability: "operations.access",
  },
  {
    key: "audit",
    section: "audit",
    href: "/audit",
    label: "操作审计",
    availability: "fixture",
    capability: "operations.access",
  },
  {
    key: "staff",
    section: "staff",
    href: "/staff",
    label: "后台成员",
    availability: "shipped",
    capability: "staff.manage",
  },
];

export function adminModuleForSection(section: string): AdminModule | undefined {
  return ADMIN_MODULES.find((module) => module.section === section);
}

export function isModuleAvailable(module: AdminModule, mode: AdminDataSourceMode): boolean {
  return module.availability === "shipped" || mode === "fixture";
}

export function visibleAdminModules(
  mode: AdminDataSourceMode,
  capabilities: readonly Capability[],
): readonly AdminModule[] {
  return ADMIN_MODULES.filter(
    (module) => isModuleAvailable(module, mode) && capabilities.includes(module.capability),
  );
}

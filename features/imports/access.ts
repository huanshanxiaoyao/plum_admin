import type { Capability } from "../../lib/auth/capabilities.ts";
import { adminApiWritesEnabled, adminDataSourceMode } from "../../lib/bff/config.ts";

/**
 * 导入复用日常运营能力，不新增独立 capability（PRD §4）。
 *
 * 这道闸门比它看起来宽：所有能进后台的运营都能批量写生产数据。约束落在别处——写开关、
 * 逐行审计、以及导入不绕过机审。要收紧就改这一个常量，再同步 BFF 允许清单与模块注册。
 */
export const IMPORT_CAPABILITY = "operations.access" satisfies Capability;

export function canUseImports(capabilities: readonly Capability[]): boolean {
  return capabilities.includes(IMPORT_CAPABILITY);
}

export type WriteAvailability = {
  readonly canWrite: boolean;
  /** `canWrite` 为 false 时给运营看的原因；为 true 时是空串。 */
  readonly blockedReason: string;
};

/**
 * 服务端预检是否可用。预检是**只读**的，只要求远端数据源，不要求写开关——
 * 把它和提交分开判断，运营在写开关关闭时仍然能拿到完整的逐行校验结果。
 */
export function serverPreflightAvailable(): boolean {
  return adminDataSourceMode() === "remote";
}

/**
 * 导入提交是否可用。比预检多一个条件：写开关必须打开。
 * 在服务端算好传给客户端组件，避免运营点完才拿 403/503。
 */
export function importWriteAvailability(): WriteAvailability {
  if (adminDataSourceMode() !== "remote") {
    return { canWrite: false, blockedReason: "当前是 fixture 数据源，导入不可用。" };
  }
  if (!adminApiWritesEnabled()) {
    return {
      canWrite: false,
      blockedReason: "Admin API 写入未启用（ADMIN_API_WRITE_ENABLED），导入不可用。",
    };
  }
  return { canWrite: true, blockedReason: "" };
}

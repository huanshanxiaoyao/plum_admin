import { getCurrentIdentity } from "@/lib/auth/session";
import { adminApiWritesEnabled, adminDataSourceMode } from "@/lib/bff/config";
import type { Capability } from "@/lib/auth/capabilities";

export async function governanceWriteAvailability(capability: Capability) {
  const identity = await getCurrentIdentity();
  if (!identity?.capabilities.includes(capability)) {
    return { canWrite: false, blockedReason: "当前账号没有此操作权限。" };
  }
  if (adminDataSourceMode() !== "remote") {
    return { canWrite: false, blockedReason: "当前为演示数据，暂不可修改。" };
  }
  if (!adminApiWritesEnabled()) {
    return { canWrite: false, blockedReason: "当前后台为只读状态。" };
  }
  return { canWrite: true, blockedReason: "" };
}

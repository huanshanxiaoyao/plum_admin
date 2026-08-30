export type AdminAuthMode = "mock" | "feishu";

export function adminAuthMode(): AdminAuthMode {
  const configured = process.env.ADMIN_AUTH_MODE?.trim();
  const fallback = process.env.NODE_ENV === "production" ? "feishu" : "mock";
  const mode = configured || fallback;
  if (mode !== "mock" && mode !== "feishu") {
    throw new Error("ADMIN_AUTH_MODE must be mock or feishu");
  }
  if (process.env.NODE_ENV === "production" && mode === "mock") {
    throw new Error("ADMIN_AUTH_MODE=mock is forbidden in production");
  }
  return mode;
}

export function isFeishuAuthEnabled(): boolean {
  return adminAuthMode() === "feishu";
}

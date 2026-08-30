import { cookies } from "next/headers";
import type { AdminIdentity } from "./types";
import { verifySessionToken } from "./session-token";
import { adminDataSourceMode } from "../bff/config";
import { resolveRemoteAdminIdentity } from "./remote-identity";

export const SESSION_COOKIE_NAME = "plum_admin_session";

export function getSessionSecret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters in production");
  }
  return "plum-admin-local-session-secret-32-chars";
}

export async function getCurrentIdentity(requestId?: string): Promise<AdminIdentity | null> {
  const cookieStore = await cookies();
  const sessionIdentity = await verifySessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
    getSessionSecret(),
  );
  if (!sessionIdentity || adminDataSourceMode() === "fixture") return sessionIdentity;
  return resolveRemoteAdminIdentity(sessionIdentity, requestId);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 8 * 60 * 60,
  };
}

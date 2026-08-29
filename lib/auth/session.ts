import { cookies } from "next/headers";
import type { AdminIdentity } from "./types";
import { verifySessionToken } from "./session-token";

export const SESSION_COOKIE_NAME = "plum_admin_session";

export function getSessionSecret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters in production");
  }
  return "plum-admin-local-session-secret-32-chars";
}

export async function getCurrentIdentity(): Promise<AdminIdentity | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, getSessionSecret());
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

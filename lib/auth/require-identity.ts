import "server-only";

import { redirect } from "next/navigation";
import { AdminApiError } from "../bff/client";
import type { Capability } from "./capabilities";
import { loginUrl } from "./return-to";
import { getCurrentIdentity } from "./session";

export async function requireIdentity(returnTo = "/", capability?: Capability) {
  let identity;
  try {
    identity = await getCurrentIdentity();
  } catch (error) {
    if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) {
      redirect(`/access-denied?code=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
  if (!identity) redirect(loginUrl(returnTo));
  if (capability && !identity.capabilities.includes(capability)) redirect("/forbidden");
  return identity;
}

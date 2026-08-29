import { capabilitiesForRole, isAdminRole } from "./capabilities.ts";
import type { AdminIdentity } from "./types.ts";

type SessionPayload = {
  version: 1;
  subject: string;
  email: string;
  displayName: string;
  role: AdminIdentity["role"];
  issuedAt: number;
  expiresAt: number;
};

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return bytes.toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(unsignedToken: string, secret: string): Promise<string> {
  const key = await signingKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsignedToken));
  return encode(new Uint8Array(signature));
}

async function hasValidSignature(unsignedToken: string, signature: string, secret: string) {
  try {
    const key = await signingKey(secret);
    return crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(unsignedToken),
    );
  } catch {
    return false;
  }
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SessionPayload>;
  return (
    payload.version === 1 &&
    typeof payload.subject === "string" &&
    typeof payload.email === "string" &&
    typeof payload.displayName === "string" &&
    isAdminRole(payload.role) &&
    typeof payload.issuedAt === "number" &&
    typeof payload.expiresAt === "number"
  );
}

export async function createSessionToken(
  identity: Omit<AdminIdentity, "capabilities">,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload: SessionPayload = {
    version: 1,
    subject: identity.id,
    email: identity.email,
    displayName: identity.displayName,
    role: identity.role,
    issuedAt: now,
    expiresAt: now + SESSION_LIFETIME_MS,
  };
  const unsignedToken = encode(JSON.stringify(payload));
  return `${unsignedToken}.${await sign(unsignedToken, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<AdminIdentity | null> {
  if (!token) return null;
  const [unsignedToken, suppliedSignature, extra] = token.split(".");
  if (!unsignedToken || !suppliedSignature || extra) return null;

  if (!(await hasValidSignature(unsignedToken, suppliedSignature, secret))) return null;

  try {
    const payload: unknown = JSON.parse(decode(unsignedToken));
    if (!isSessionPayload(payload)) return null;
    if (payload.issuedAt > now + 60_000 || payload.expiresAt <= now) return null;

    return {
      id: payload.subject,
      email: payload.email,
      displayName: payload.displayName,
      role: payload.role,
      capabilities: capabilitiesForRole(payload.role),
    };
  } catch {
    return null;
  }
}

const OAUTH_TRANSACTION_LIFETIME_MS = 10 * 60 * 1000;
const DENIED_IDENTITY_LIFETIME_MS = 5 * 60 * 1000;

type OAuthTransactionPayload = {
  version: 1;
  state: string;
  codeVerifier: string;
  expiresAt: number;
};

type DeniedIdentityPayload = {
  version: 1;
  openId: string;
  displayName: string;
  expiresAt: number;
};

export type OAuthTransaction = {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  cookieValue: string;
};

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

async function signPayload(payload: object, secret: string): Promise<string> {
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encode(new Uint8Array(signature))}`;
}

async function verifyPayload(token: string | undefined, secret: string): Promise<unknown> {
  if (!token) return null;
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      Buffer.from(suppliedSignature, "base64url"),
      new TextEncoder().encode(encodedPayload),
    );
    return valid ? JSON.parse(decode(encodedPayload)) : null;
  } catch {
    return null;
  }
}

function randomBase64Url(size: number): string {
  return encode(crypto.getRandomValues(new Uint8Array(size)));
}

function isSafeOpaqueValue(value: unknown, minLength: number, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export async function createOAuthTransaction(
  secret: string,
  now = Date.now(),
): Promise<OAuthTransaction> {
  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const payload: OAuthTransactionPayload = {
    version: 1,
    state,
    codeVerifier,
    expiresAt: now + OAUTH_TRANSACTION_LIFETIME_MS,
  };
  return {
    state,
    codeVerifier,
    codeChallenge: encode(new Uint8Array(digest)),
    cookieValue: await signPayload(payload, secret),
  };
}

export async function verifyOAuthTransaction(
  token: string | undefined,
  expectedState: string | null,
  secret: string,
  now = Date.now(),
): Promise<Pick<OAuthTransaction, "state" | "codeVerifier"> | null> {
  const value = await verifyPayload(token, secret);
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<OAuthTransactionPayload>;
  if (
    payload.version !== 1 ||
    !isSafeOpaqueValue(payload.state, 32, 128) ||
    !isSafeOpaqueValue(payload.codeVerifier, 43, 128) ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= now ||
    payload.expiresAt > now + OAUTH_TRANSACTION_LIFETIME_MS ||
    payload.state !== expectedState
  ) {
    return null;
  }
  return { state: payload.state, codeVerifier: payload.codeVerifier };
}

export async function createDeniedIdentityToken(
  identity: { openId: string; displayName: string },
  secret: string,
  now = Date.now(),
): Promise<string> {
  return signPayload(
    {
      version: 1,
      openId: identity.openId,
      displayName: identity.displayName,
      expiresAt: now + DENIED_IDENTITY_LIFETIME_MS,
    } satisfies DeniedIdentityPayload,
    secret,
  );
}

export async function verifyDeniedIdentityToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<{ openId: string; displayName: string } | null> {
  const value = await verifyPayload(token, secret);
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<DeniedIdentityPayload>;
  if (
    payload.version !== 1 ||
    !isSafeOpaqueValue(payload.openId, 3, 128) ||
    typeof payload.displayName !== "string" ||
    payload.displayName.length > 200 ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= now ||
    payload.expiresAt > now + DENIED_IDENTITY_LIFETIME_MS
  ) {
    return null;
  }
  return { openId: payload.openId, displayName: payload.displayName };
}

/** Resolve the public request origin after a trusted reverse proxy. */
export function requestOrigin(request: Request): URL {
  const requestUrl = new URL(request.url);
  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const protocol = forwardedProtocol ? `${forwardedProtocol.replace(/:$/, "")}:` : requestUrl.protocol;
  const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;

  if (protocol !== "http:" && protocol !== "https:") {
    return new URL(requestUrl.origin);
  }
  try {
    return new URL(`${protocol}//${host}`);
  } catch {
    return new URL(requestUrl.origin);
  }
}

/** Build an absolute public URL for an application-local path. */
export function publicUrl(request: Request, path: string): URL {
  return new URL(path, requestOrigin(request));
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const originUrl = new URL(origin);
    return originUrl.origin === requestOrigin(request).origin;
  } catch {
    return false;
  }
}

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(",", 1)[0]?.trim() || undefined;
}

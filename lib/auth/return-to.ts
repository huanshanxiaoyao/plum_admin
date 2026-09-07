const LOCAL_ORIGIN = "https://admin.plum.top";

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 2048) return "/";
  if (value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return "/";
    const pathname = decodeURIComponent(url.pathname);
    // Returning to authentication endpoints can restart login or trigger a logout.
    if (
      /[\\\u0000-\u0020\u007f%]/.test(pathname) || pathname.startsWith("//") ||
      /^\/(?:api|login|access-denied)(?:\/|$)/i.test(pathname)
    ) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function loginUrl(returnTo: unknown, error?: string): string {
  const destination = safeReturnTo(returnTo);
  const params = new URLSearchParams();
  if (destination !== "/") params.set("returnTo", destination);
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

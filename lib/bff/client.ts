export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function adminApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Admin API path must be same-origin and start with a single slash");
  }
  const response = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new AdminApiError(response.status, "unexpected_response", "Unexpected API response.");
  }
  const body = await response.json();
  if (!response.ok) {
    throw new AdminApiError(
      response.status,
      body?.error?.code ?? "request_failed",
      body?.error?.message ?? "Request failed.",
      body?.error?.request_id,
    );
  }
  return body as T;
}

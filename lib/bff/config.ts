export type AdminDataSourceMode = "fixture" | "remote";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function adminDataSourceMode(): AdminDataSourceMode {
  const configured = process.env.ADMIN_DATA_SOURCE?.trim();
  const fallback = process.env.NODE_ENV === "production" ? "remote" : "fixture";
  const mode = configured || fallback;
  if (mode !== "fixture" && mode !== "remote") {
    throw new Error("ADMIN_DATA_SOURCE must be fixture or remote");
  }
  if (process.env.NODE_ENV === "production" && mode === "fixture") {
    throw new Error("ADMIN_DATA_SOURCE=fixture is forbidden in production");
  }
  return mode;
}

export function adminApiOrigin(): URL {
  const configured = process.env.ADMIN_API_ORIGIN?.trim();
  if (!configured) throw new Error("ADMIN_API_ORIGIN is required for remote Admin API access");

  const origin = new URL(configured);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("ADMIN_API_ORIGIN must contain only the API origin");
  }
  const loopback = LOOPBACK_HOSTS.has(origin.hostname);
  if (process.env.NODE_ENV !== "production" && loopback) {
    throw new Error("Local development must use a remote Admin API, not a loopback backend");
  }
  if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "production" && loopback)) {
    throw new Error("Remote Admin API access requires HTTPS");
  }
  return origin;
}

export function adminApiWritesEnabled(): boolean {
  return process.env.ADMIN_API_WRITE_ENABLED === "true";
}

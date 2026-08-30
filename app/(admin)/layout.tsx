import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getCurrentIdentity } from "@/lib/auth/session";
import { AdminApiError } from "@/lib/bff/client";
import { adminDataSourceMode } from "@/lib/bff/config";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  let identity;
  try {
    identity = await getCurrentIdentity();
  } catch (error) {
    if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) {
      redirect(`/access-denied?code=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
  if (!identity) redirect("/login");
  const environmentLabel = process.env.NODE_ENV === "production"
    ? "Production"
    : `Development · ${adminDataSourceMode() === "fixture" ? "Fixture" : "Remote"}`;
  return <AdminShell identity={identity} environmentLabel={environmentLabel}>{children}</AdminShell>;
}

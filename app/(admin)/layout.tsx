import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin-shell/admin-shell";
import { visibleAdminModules } from "@/features/admin-navigation/modules";
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
  const dataSourceMode = adminDataSourceMode();
  const environmentLabel = process.env.NODE_ENV === "production"
    ? "Production"
    : `Development · ${dataSourceMode === "fixture" ? "Fixture" : "Remote"}`;
  const navigation = visibleAdminModules(dataSourceMode, identity.capabilities);
  return (
    <AdminShell identity={identity} navigation={navigation} environmentLabel={environmentLabel}>
      {children}
    </AdminShell>
  );
}

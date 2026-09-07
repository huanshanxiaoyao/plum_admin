import { visibleAdminModules } from "@/features/admin-navigation/modules";
import type { AdminIdentity } from "@/lib/auth/types";
import { adminDataSourceMode } from "@/lib/bff/config";
import { AdminShell } from "./admin-shell";

export function AdminWorkspace({ identity, children }: {
  identity: AdminIdentity;
  children: React.ReactNode;
}) {
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

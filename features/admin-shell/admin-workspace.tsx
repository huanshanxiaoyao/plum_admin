import { visibleAdminModules } from "@/features/admin-navigation/modules";
import type { AdminIdentity } from "@/lib/auth/types";
import { adminDataSourceMode } from "@/lib/bff/config";
import { evalReportsEnabled } from "@/lib/eval-reports/config";
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
  // 记忆评测是工程内部工具，不是运营能力：它有自己的页面，这里只在页面底部留一条跳转，
  // 不进主导航，也不进 ADMIN_MODULES。
  const footerLinks =
    identity.role === "admin" && evalReportsEnabled()
      ? [{ href: "/eval", label: "记忆评测报告 →" }]
      : [];
  return (
    <AdminShell
      identity={identity}
      navigation={navigation}
      environmentLabel={environmentLabel}
      footerLinks={footerLinks}
    >
      {children}
    </AdminShell>
  );
}

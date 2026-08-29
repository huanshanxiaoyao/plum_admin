import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getCurrentIdentity } from "@/lib/auth/session";
import { adminDataSourceMode } from "@/lib/bff/config";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  const environmentLabel = process.env.NODE_ENV === "production"
    ? "Production"
    : `Development · ${adminDataSourceMode() === "fixture" ? "Fixture" : "Remote"}`;
  return <AdminShell identity={identity} environmentLabel={environmentLabel}>{children}</AdminShell>;
}

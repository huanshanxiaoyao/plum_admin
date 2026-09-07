import { AdminWorkspace } from "@/features/admin-shell/admin-workspace";
import { requireIdentity } from "@/lib/auth/require-identity";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireIdentity();
  return <AdminWorkspace identity={identity}>{children}</AdminWorkspace>;
}

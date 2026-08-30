import { AdminSectionPage, type AdminSectionPageProps } from "@/features/admin-sections/admin-section-page";
import { auditSection } from "@/features/audit/list-definition";

export default function AuditPage({ searchParams }: AdminSectionPageProps) {
  return <AdminSectionPage definition={auditSection} searchParams={searchParams} />;
}

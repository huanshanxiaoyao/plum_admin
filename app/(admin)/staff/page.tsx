import { AdminSectionPage, type AdminSectionPageProps } from "@/features/admin-sections/admin-section-page";
import { staffSection } from "@/features/staff/list-definition";

export default function StaffPage({ searchParams }: AdminSectionPageProps) {
  return <AdminSectionPage definition={staffSection} searchParams={searchParams} />;
}

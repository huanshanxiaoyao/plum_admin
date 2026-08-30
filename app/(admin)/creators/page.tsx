import { AdminSectionPage, type AdminSectionPageProps } from "@/features/admin-sections/admin-section-page";
import { creatorsSection } from "@/features/creators/list-definition";

export default function CreatorsPage({ searchParams }: AdminSectionPageProps) {
  return <AdminSectionPage definition={creatorsSection} searchParams={searchParams} />;
}

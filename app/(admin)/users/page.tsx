import { AdminSectionPage, type AdminSectionPageProps } from "@/features/admin-sections/admin-section-page";
import { usersSection } from "@/features/users/list-definition";

export default function UsersPage({ searchParams }: AdminSectionPageProps) {
  return <AdminSectionPage definition={usersSection} searchParams={searchParams} />;
}

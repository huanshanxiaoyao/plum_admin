import { AdminSectionPage, type AdminSectionPageProps } from "@/features/admin-sections/admin-section-page";
import { charactersSection } from "@/features/characters/list-definition";

export default function CharactersPage({ searchParams }: AdminSectionPageProps) {
  return <AdminSectionPage definition={charactersSection} searchParams={searchParams} />;
}

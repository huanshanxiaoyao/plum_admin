import { ContentPage, type ContentPageProps } from "@/features/characters/content-page";

export default function CharactersPage({ searchParams }: ContentPageProps) {
  return <ContentPage searchParams={searchParams} />;
}

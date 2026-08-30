import { CharacterDetailPage } from "@/features/characters/detail-pages";

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CharacterDetailPage params={params} searchParams={searchParams} />;
}

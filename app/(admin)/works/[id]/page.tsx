import { WorkDetailPage } from "@/features/characters/detail-pages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <WorkDetailPage params={params} />;
}

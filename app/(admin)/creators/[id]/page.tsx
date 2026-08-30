import { CreatorDetailPage } from "@/features/creators/creator-pages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CreatorDetailPage params={params} />;
}

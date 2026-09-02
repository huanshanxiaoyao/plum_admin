import { ModerationReviewDetailPage } from "@/features/moderation/review-detail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ModerationReviewDetailPage params={params} />;
}

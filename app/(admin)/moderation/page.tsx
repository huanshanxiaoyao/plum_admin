import { ModerationQueuePage, type ModerationQueuePageProps } from "@/features/moderation/queue-page";

export default function ModerationPage({ searchParams }: ModerationQueuePageProps) {
  return <ModerationQueuePage searchParams={searchParams} />;
}

import { AdminSectionPage, type AdminSectionPageProps } from "@/features/admin-sections/admin-section-page";
import { subscriptionsSection } from "@/features/subscriptions/list-definition";

export default function SubscriptionsPage({ searchParams }: AdminSectionPageProps) {
  return <AdminSectionPage definition={subscriptionsSection} searchParams={searchParams} />;
}

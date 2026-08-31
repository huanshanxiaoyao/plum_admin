import { UserDetailPage } from "@/features/users/user-pages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <UserDetailPage params={params} />;
}

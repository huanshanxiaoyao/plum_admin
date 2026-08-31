import { UserListPage, type UserListPageProps } from "@/features/users/user-pages";

export default function UsersPage({ searchParams }: UserListPageProps) {
  return <UserListPage searchParams={searchParams} />;
}

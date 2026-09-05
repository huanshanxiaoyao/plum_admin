import { ImportHistoryPage, type ImportHistoryPageProps } from "@/features/imports/history-page";

export default function ImportBatchesPage({ searchParams }: ImportHistoryPageProps) {
  return <ImportHistoryPage searchParams={searchParams} />;
}

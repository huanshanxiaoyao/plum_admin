import { ImportResultPage } from "@/features/imports/result-page";

export default function ImportBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  return <ImportResultPage params={params} />;
}

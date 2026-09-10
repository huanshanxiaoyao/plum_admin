import { CandidateWorkbenchPage } from "@/features/character-factory/factory-pages";

export const dynamic = "force-dynamic";

type CandidateWorkbenchParams = Promise<{
  runId: string;
  candidateId: string;
}>;

export default function CharacterFactoryCandidatePage({
  params,
}: {
  params: CandidateWorkbenchParams;
}) {
  return <CandidateWorkbenchPage params={params} />;
}

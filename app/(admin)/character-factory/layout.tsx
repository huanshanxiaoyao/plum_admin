import { FactoryTabs } from "@/features/character-factory/factory-tabs";
import { FactorySessionProvider } from "@/features/character-factory/factory-session";
import { requireIdentity } from "@/lib/auth/require-identity";

export default async function CharacterFactoryLayout({ children }: { children: React.ReactNode }) {
  await requireIdentity("/character-factory", "operations.access");
  return <FactorySessionProvider><FactoryTabs>{children}</FactoryTabs></FactorySessionProvider>;
}

"use client";

import { createContext, useContext, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { OwnerAccount } from "@/features/imports/owner-picker";
import type { ContentMode, FactorySourceType } from "./contracts";

export type BatchStage = "source" | "discovering" | "discovery_failed" | "pool" | "generating" | "review" | "submitted";
export type BatchSourceType = Exclude<FactorySourceType, "mixed">;

export type LocalCandidate = {
  readonly id: string;
  title: string;
  description: string;
  evidence: string;
  selected: boolean;
  status: "ready" | "generating" | "failed" | "submitted";
  draftRevision?: number | null;
  preflightReady?: boolean | null;
  preflightIssues?: readonly string[];
  submissionStatus?: "published" | "pending_review" | "rejected" | "failed" | null;
  submissionMessage?: string | null;
};

export type MultiSession = {
  readonly contentMode: ContentMode;
  readonly sourceType: BatchSourceType;
  readonly urls: string;
  readonly description: string;
  readonly images: readonly File[];
  readonly targetCount: number;
  readonly language: string;
  readonly market: string;
  readonly owner: OwnerAccount | null;
  readonly stage: BatchStage;
  readonly runId: string;
  readonly candidates: readonly LocalCandidate[];
  readonly reason: string;
  readonly confirmed: boolean;
};

type FactorySessionValue = {
  readonly multiSession: MultiSession | null;
  readonly setMultiSession: Dispatch<SetStateAction<MultiSession | null>>;
};

const FactorySessionContext = createContext<FactorySessionValue | null>(null);

export function FactorySessionProvider({ children }: { readonly children: ReactNode }) {
  const [multiSession, setMultiSession] = useState<MultiSession | null>(null);
  return (
    <FactorySessionContext.Provider value={{ multiSession, setMultiSession }}>
      {children}
    </FactorySessionContext.Provider>
  );
}

export function useFactorySession(): FactorySessionValue {
  const value = useContext(FactorySessionContext);
  if (!value) throw new Error("useFactorySession must be used inside FactorySessionProvider");
  return value;
}

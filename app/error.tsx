"use client";

import { RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", justifyItems: "center", gap: 10 }}>
      <span style={{ color: "var(--red)", fontSize: 11, fontWeight: 800 }}>500</span>
      <h1 style={{ margin: 0, fontSize: 24 }}>页面加载失败</h1>
      <button
        type="button"
        onClick={reset}
        style={{ height: 36, display: "flex", alignItems: "center", gap: 7, padding: "0 12px", border: "1px solid var(--line-strong)", borderRadius: 5, background: "var(--surface)" }}
      >
        <RotateCcw size={16} /> 重试
      </button>
    </main>
  );
}

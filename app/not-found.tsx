import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", justifyItems: "center", gap: 10 }}>
      <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 800 }}>404</span>
      <h1 style={{ margin: 0, fontSize: 24 }}>页面不存在</h1>
      <Link href="/" style={{ color: "var(--green)", fontSize: 12 }}>返回工作台</Link>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, UserRoundCog } from "lucide-react";
import type { AdminRole } from "@/lib/auth/capabilities";
import styles from "./login.module.css";

export function LoginForm({ mockEnabled }: { mockEnabled: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole>("operator");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error("登录失败，请稍后重试。");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败，请稍后重试。");
      setPending(false);
    }
  }

  if (!mockEnabled) {
    return (
      <div className={styles.providerUnavailable} role="status">
        <ShieldCheck size={18} />
        <span>飞书登录尚未配置</span>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.segmented} aria-label="模拟身份">
        <button
          type="button"
          className={role === "operator" ? styles.selected : undefined}
          aria-pressed={role === "operator"}
          onClick={() => setRole("operator")}
        >
          <UserRoundCog size={17} />
          Operator
        </button>
        <button
          type="button"
          className={role === "admin" ? styles.selected : undefined}
          aria-pressed={role === "admin"}
          onClick={() => setRole("admin")}
        >
          <ShieldCheck size={17} />
          Admin
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.submit} disabled={pending} onClick={signIn}>
        <span>{pending ? "正在登录" : "进入管理后台"}</span>
        <ArrowRight size={18} />
      </button>
      <span className={styles.environment}>LOCAL MOCK IDENTITY</span>
    </div>
  );
}

"use client";

import { LoaderCircle, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StaffSummary } from "@/lib/admin/contracts";
import styles from "./staff-status-action.module.css";

export function StaffStatusAction({ member }: { member: StaffSummary }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const enabling = member.status === "disabled";
  const label = enabling ? "恢复" : "禁用";
  const Icon = pending ? LoaderCircle : enabling ? UserCheck : UserX;

  async function updateStatus() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/admin-users/${encodeURIComponent(member.open_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: enabling ? "active" : "disabled" }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body
          ? (body.error as { message?: unknown }).message
          : null;
        throw new Error(typeof message === "string" ? message : `${label}失败`);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${label}失败`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.action}>
      <button
        type="button"
        className={enabling ? styles.enable : styles.disable}
        disabled={pending}
        onClick={updateStatus}
        title={`${label} ${member.display_name}`}
      >
        <Icon className={pending ? styles.spinning : undefined} size={15} />
        {pending ? "处理中" : label}
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

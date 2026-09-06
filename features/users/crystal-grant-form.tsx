"use client";

import { AlertTriangle, CheckCircle2, Gem, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/bff/client";
import type { CrystalGrantRequest } from "@/features/admin-resources/contracts";
import { parseCrystalGrantResponse } from "@/features/admin-resources/contracts";
import styles from "./crystal-grant-form.module.css";

type Props = {
  platformUserId: string;
  displayName: string;
  canWrite: boolean;
  blockedReason: string;
};

type RetryIdentity = { fingerprint: string; key: string };

function formatCrystals(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(value);
}

function grantErrorText(error: unknown): string {
  if (!(error instanceof AdminApiError)) return error instanceof Error ? error.message : "充值失败，请重试。";
  if (error.code === "membership_inactive") return "该用户的 Plum Membership 未启用，不能充值。";
  if (error.code === "wallet_account_unavailable") return "该用户没有有效的 Plum 账号，不能充值。";
  if (error.code === "wallet_account_conflict") return "该用户关联了多个有效 Plum 账号，请先修复账号归属。";
  if (error.code === "idempotency_conflict") return "本次请求的幂等键发生冲突，请重新确认后提交。";
  return error.message;
}

export function CrystalGrantForm({ platformUserId, displayName, canWrite, blockedReason }: Props) {
  const router = useRouter();
  const retryIdentity = useRef<RetryIdentity | null>(null);
  const [amount, setAmount] = useState("");
  const [validityDays, setValidityDays] = useState("30");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    const numericValidityDays = Number(validityDays);
    const cleanedReason = reason.trim();
    if (
      !Number.isInteger(numericAmount) || numericAmount < 1 || numericAmount > 5000 ||
      !Number.isInteger(numericValidityDays) || numericValidityDays < 1 || numericValidityDays > 90 ||
      !cleanedReason
    ) return;

    const confirmed = window.confirm(
      `确认向 ${displayName}（${platformUserId}）充值 ${numericAmount.toLocaleString("zh-CN")} 水晶，`
      + `有效期 ${numericValidityDays} 天？`,
    );
    if (!confirmed) return;

    const payload: CrystalGrantRequest = {
      amount: numericAmount,
      validity_days: numericValidityDays,
      reason: cleanedReason,
    };
    const fingerprint = JSON.stringify(payload);
    const idempotencyKey = retryIdentity.current?.fingerprint === fingerprint
      ? retryIdentity.current.key
      : crypto.randomUUID();
    retryIdentity.current = { fingerprint, key: idempotencyKey };

    setPending(true);
    setError("");
    setSuccess("");
    try {
      const response = await adminApiFetch<unknown>(
        `/users/${encodeURIComponent(platformUserId)}/wallet/grants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        },
      );
      const result = parseCrystalGrantResponse(response).data;
      retryIdentity.current = null;
      setSuccess(
        `已充值 ${formatCrystals(result.amount)} 水晶，当前余额 ${formatCrystals(result.balance_after)}`
        + (result.replayed ? "（幂等重放）" : ""),
      );
      setReason("");
      router.refresh();
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.code === "idempotency_conflict") {
        retryIdentity.current = null;
      }
      setError(grantErrorText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.heading}>
        <div><Gem size={16} /><h3>人工充值</h3></div>
        <span>测试期</span>
      </div>

      {!canWrite && <p className={styles.blocked}><AlertTriangle size={14} />{blockedReason}</p>}

      <fieldset disabled={!canWrite || pending}>
        <label>
          <span>充值数量</span>
          <input
            type="number"
            name="amount"
            min={1}
            max={5000}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <small>水晶，最多 5,000</small>
        </label>
        <label>
          <span>有效期</span>
          <input
            type="number"
            name="validity_days"
            min={1}
            max={90}
            step={1}
            required
            value={validityDays}
            onChange={(event) => setValidityDays(event.target.value)}
          />
          <small>天，最长 90 天</small>
        </label>
        <label className={styles.reason}>
          <span>充值原因</span>
          <textarea
            name="reason"
            maxLength={500}
            required
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <small>{reason.length}/500</small>
        </label>
        <button type="submit" disabled={!canWrite || pending}>
          {pending ? <LoaderCircle className={styles.spinning} size={15} /> : <Gem size={15} />}
          {pending ? "充值中" : "确认充值"}
        </button>
      </fieldset>

      {error && <p className={styles.error} role="alert"><AlertTriangle size={14} />{error}</p>}
      {success && <p className={styles.success} role="status"><CheckCircle2 size={14} />{success}</p>}
    </form>
  );
}

"use client";

import { AlertTriangle, Check, LoaderCircle, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ModerationDecision, ModerationReviewSummary } from "@/features/admin-resources/contracts";
import { DECISION_LABELS, REASON_CODE_SUGGESTIONS } from "./labels";
import styles from "./decision-actions.module.css";

type Props = {
  reviewId: string;
  status: ModerationReviewSummary["status"];
  assignedTo: string | null;
  /** 服务端算好的写权限：fixture 数据源或写开关关闭时，按钮直接禁用而不是点了才拿 403。 */
  canWrite: boolean;
  writeBlockedReason: string;
};

const DECISION_HINTS: Record<ModerationDecision, string> = {
  release: "内容转为公开可见，解除自见锁。",
  confine: "内容保持仅创作者自己可见，创作者不能自行解除。",
  purge: "服务端不再保留正文与图片，且该内容指纹会被记住。此操作不可撤销。",
};

/** 清除的对象删除计数：failed_objects 非 0 表示高危字节还在存储里，运营必须看到。 */
function purgeWarning(body: unknown): string {
  if (!body || typeof body !== "object" || !("content_purge" in body)) return "";
  const purge = (body as { content_purge?: unknown }).content_purge;
  if (!purge || typeof purge !== "object") return "";
  const failed = (purge as { failed_objects?: unknown }).failed_objects;
  if (typeof failed !== "number" || failed <= 0) return "";
  return `正文已清除，但有 ${failed} 个图片对象删除失败，字节仍在存储里。后台会自动重试；`
    + `若持续失败请联系 SRE 检查对象存储。`;
}

function errorText(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body.error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function DecisionActions({ reviewId, status, assignedTo, canWrite, writeBlockedReason }: Props) {
  const router = useRouter();
  const [decision, setDecision] = useState<ModerationDecision>("release");
  const [reasonCode, setReasonCode] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [note, setNote] = useState("");
  const [purgeAcknowledged, setPurgeAcknowledged] = useState(false);
  const [pending, setPending] = useState<"claim" | "decision" | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const effectiveReason = (reasonCode === "other" ? customReason : reasonCode).trim();
  const reasonRequired = decision === "confine" || decision === "purge";
  const blockedByReason = reasonRequired && !effectiveReason;
  const blockedByPurgeConfirm = decision === "purge" && !purgeAcknowledged;

  async function post(path: string, body?: unknown, kind: "claim" | "decision" = "decision") {
    setPending(kind);
    setError("");
    setWarning("");
    try {
      const response = await fetch(`/api/admin/moderation/reviews/${encodeURIComponent(reviewId)}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorText(payload, kind === "claim" ? "认领失败" : "处置失败"));
      setWarning(purgeWarning(payload));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败");
    } finally {
      setPending(null);
    }
  }

  if (status !== "pending" && status !== "reviewing") {
    return (
      <div className={styles.closed}>
        <ShieldCheck size={15} />
        <span>该复核已是终态，不能再处置。</span>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      {!canWrite && <p className={styles.blocked}><AlertTriangle size={14} />{writeBlockedReason}</p>}

      <div className={styles.claimRow}>
        <button
          type="button"
          className={styles.claim}
          disabled={!canWrite || status === "reviewing" || pending !== null}
          onClick={() => void post("/claim", undefined, "claim")}
          title={status === "reviewing" ? `已由 ${assignedTo ?? "他人"} 认领` : "认领这条复核"}
        >
          {pending === "claim" ? <LoaderCircle className={styles.spinning} size={15} /> : <UserCheck size={15} />}
          {status === "reviewing" ? `已认领 · ${assignedTo ?? "未知"}` : "认领"}
        </button>
        <small>认领只是把这条队列指给自己，不影响处置权限。</small>
      </div>

      <fieldset className={styles.decisions} disabled={!canWrite || pending !== null}>
        <legend>处置</legend>
        {(Object.keys(DECISION_LABELS) as ModerationDecision[]).map((option) => (
          <label key={option} className={decision === option ? styles.selected : undefined}>
            <input
              type="radio"
              name="decision"
              value={option}
              checked={decision === option}
              onChange={() => { setDecision(option); setPurgeAcknowledged(false); }}
            />
            <span><strong>{DECISION_LABELS[option]}</strong><small>{DECISION_HINTS[option]}</small></span>
          </label>
        ))}
      </fieldset>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span>原因码{reasonRequired && <b> *</b>}</span>
          <select
            value={reasonCode}
            disabled={!canWrite || pending !== null}
            onChange={(event) => setReasonCode(event.target.value)}
          >
            <option value="">未选择</option>
            {REASON_CODE_SUGGESTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        {reasonCode === "other" && (
          <label className={styles.field}>
            <span>自定义原因码</span>
            <input
              value={customReason}
              maxLength={80}
              disabled={!canWrite || pending !== null}
              onChange={(event) => setCustomReason(event.target.value)}
              placeholder="小写下划线，例如 impersonation_public_figure"
            />
          </label>
        )}
        <label className={`${styles.field} ${styles.noteField}`}>
          <span>备注</span>
          <textarea
            value={note}
            maxLength={1000}
            rows={3}
            disabled={!canWrite || pending !== null}
            onChange={(event) => setNote(event.target.value)}
            placeholder="内部留痕，不直接展示给创作者"
          />
        </label>
      </div>

      {decision === "purge" && (
        <label className={styles.acknowledge}>
          <input
            type="checkbox"
            checked={purgeAcknowledged}
            disabled={!canWrite || pending !== null}
            onChange={(event) => setPurgeAcknowledged(event.target.checked)}
          />
          <span>我确认服务端将不再保留该内容的正文与图片，此操作不可撤销。</span>
        </label>
      )}

      <div className={styles.submitRow}>
        <button
          type="button"
          className={decision === "purge" ? styles.danger : styles.submit}
          disabled={!canWrite || pending !== null || blockedByReason || blockedByPurgeConfirm}
          onClick={() => void post("/decision", { decision, reason_code: effectiveReason, note: note.trim() })}
        >
          {pending === "decision"
            ? <LoaderCircle className={styles.spinning} size={15} />
            : decision === "purge" ? <Trash2 size={15} /> : <Check size={15} />}
          提交处置
        </button>
        {blockedByReason && <small className={styles.hint}>不通过与下架必须给出原因码。</small>}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {warning && <p className={styles.warning} role="alert">{warning}</p>}
    </div>
  );
}

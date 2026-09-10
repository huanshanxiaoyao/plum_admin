"use client";

import { AlertTriangle, CheckCircle2, EyeOff, LoaderCircle, RotateCcw, Save, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/bff/client";
import type { components } from "@/contracts/generated/admin-api";
import { parseCharacterResponse, parseUserResponse } from "./contracts";
import { RESTORE_REASON_CODES, TAKEDOWN_REASON_CODES } from "./reason-codes";
import styles from "./governance-form.module.css";

type Props = {
  id: string;
  displayName: string;
  canWrite: boolean;
  blockedReason: string;
} & (
  { kind: "membership"; status: "active" | "disabled" }
  | { kind: "rating"; rating: "general" | "mature"; contentVersion: number }
  | { kind: "takedown" }
  | { kind: "restore" }
);

/**
 * 撤销 worker 还没跑完时，公开副本正处在「正要被删」的中间态，此刻恢复会和它抢同一批
 * object key，后端直接拒。这不是操作错误，等一会儿重试即可，所以要和通用失败分开说。
 */
const RETRY_AFTER_REVOCATION = new Set([
  "character_image_revocation_in_progress",
  "character_image_public_reconciliation_in_progress",
]);

export function GovernanceForm(props: Props) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState<"general" | "mature">(props.kind === "rating" ? props.rating : "general");
  const codes: readonly string[] = props.kind === "restore" ? RESTORE_REASON_CODES : TAKEDOWN_REASON_CODES;
  const [reasonCode, setReasonCode] = useState<string>(codes[0]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const unban = props.kind === "membership" && props.status === "disabled";
  const needsReasonCode = props.kind === "takedown" || props.kind === "restore";
  const label = props.kind === "rating" ? "保存分级"
    : props.kind === "takedown" ? "下架角色"
      : props.kind === "restore" ? "恢复上架"
        : unban ? "解除封禁" : "封禁用户";
  const Icon = pending ? LoaderCircle
    : props.kind === "rating" ? Save
      : props.kind === "takedown" ? EyeOff
        : props.kind === "restore" ? RotateCcw
          : unban ? UserCheck : UserX;
  const unchanged = props.kind === "rating" && rating === props.rating;

  function confirmation(): string {
    if (props.kind === "rating") return `确认将 ${props.displayName} 的当前版本分级从 ${props.rating} 改为 ${rating}？`;
    if (props.kind === "takedown") {
      return `确认下架 ${props.displayName}？角色将退出公开分发、用户不能再新建会话，公开图片副本会被撤下。此操作可由 Admin 恢复。`;
    }
    if (props.kind === "restore") {
      return `确认恢复 ${props.displayName}？角色将重新对外可见，公开图片副本需要重新提升，可能需要片刻才全部生效。`;
    }
    return unban
      ? `确认解除 ${props.displayName} 的 Plum 封禁？`
      : `确认封禁 ${props.displayName}？该用户将无法登录和使用 Plum，现有登录会话将失效。`;
  }

  function request(): { path: string; method: "PATCH" | "POST"; payload: unknown } {
    const trimmed = reason.trim();
    const character = `/characters/${encodeURIComponent(props.id)}`;
    if (props.kind === "membership") {
      const payload: components["schemas"]["AdminMembershipUpdateRequest"] = {
        status: unban ? "active" : "disabled", expected_status: props.status, reason: trimmed,
      };
      return { path: `/users/${encodeURIComponent(props.id)}/membership`, method: "PATCH", payload };
    }
    if (props.kind === "rating") {
      const payload: components["schemas"]["AdminCharacterRatingRequest"] = {
        content_rating: rating, expected_rating: props.rating,
        expected_content_version: props.contentVersion, reason: trimmed,
      };
      return { path: `${character}/rating`, method: "PATCH", payload };
    }
    if (props.kind === "takedown") {
      // expected_status 恒为 active：入口只在 active 时渲染，后端拿它做 CAS，
      // 页面过期或别人抢先下架时会返回 409，而不是把已下架的角色再下架一次。
      const payload: components["schemas"]["AdminCharacterTakedownRequest"] = {
        expected_status: "active", reason_code: reasonCode, reason: trimmed,
      };
      return { path: `${character}/takedown`, method: "POST", payload };
    }
    const payload: components["schemas"]["AdminCharacterRestoreRequest"] = {
      reason_code: reasonCode, reason: trimmed,
    };
    return { path: `${character}/restore`, method: "POST", payload };
  }

  function describe(caught: unknown): string {
    if (!(caught instanceof AdminApiError)) return caught instanceof Error ? caught.message : "操作失败，请重试。";
    if (caught.code === "character_moderation_hold") return "该角色已被内容复核处置，不能从这里恢复。";
    if (RETRY_AFTER_REVOCATION.has(caught.code)) return "公开图片的撤销还没跑完，请稍后重试。";
    if (caught.code === "character_image_set_not_ready") return "该角色的图片尚未就绪，暂时无法恢复公开投放。";
    return caught.message;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.canWrite || inFlight.current || !reason.trim() || unchanged) return;
    if (!window.confirm(confirmation())) return;
    const { path, method, payload } = request();
    inFlight.current = true;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminApiFetch<unknown>(path, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (props.kind === "membership") parseUserResponse(result);
      else parseCharacterResponse(result);
      setReason("");
      setSuccess(props.kind === "rating" ? "分级已更新"
        : props.kind === "takedown" ? "角色已下架"
          : props.kind === "restore" ? "角色已恢复上架"
            : unban ? "已解除封禁" : "用户已封禁");
      router.refresh();
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.code === "resource_conflict") {
        setError("数据已被更新，请核对刷新后的状态再提交。");
        router.refresh();
      } else setError(describe(caught));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <form className={styles.form} onSubmit={(event) => void submit(event)}>
    {!props.canWrite && <p className={styles.blocked}>{props.blockedReason}</p>}
    <fieldset disabled={!props.canWrite || pending}>
      {props.kind === "rating" && <label><span>内容分级</span><select value={rating} onChange={(event) => setRating(event.target.value as "general" | "mature")}>
        <option value="general">General</option><option value="mature">Mature</option>
      </select></label>}
      {needsReasonCode && <label><span>原因码</span><select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
        {codes.map((code) => <option key={code} value={code}>{code}</option>)}
      </select></label>}
      <label><span>操作原因</span><textarea required maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="submit" disabled={!props.canWrite || pending || unchanged || !reason.trim()}>
        <Icon size={15} />{pending ? "提交中" : label}
      </button>
    </fieldset>
    {error && <p className={styles.error} role="alert"><AlertTriangle size={15} />{error}</p>}
    {success && <p className={styles.success} role="status"><CheckCircle2 size={15} />{success}</p>}
  </form>;
}

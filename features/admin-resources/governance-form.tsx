"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle, Save, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/bff/client";
import type { components } from "@/contracts/generated/admin-api";
import { parseCharacterResponse, parseUserResponse } from "./contracts";
import styles from "./governance-form.module.css";

type Props = {
  id: string;
  displayName: string;
  canWrite: boolean;
  blockedReason: string;
} & (
  { kind: "membership"; status: "active" | "disabled" }
  | { kind: "rating"; rating: "general" | "mature"; contentVersion: number }
);

export function GovernanceForm(props: Props) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState<"general" | "mature">(props.kind === "rating" ? props.rating : "general");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const unban = props.kind === "membership" && props.status === "disabled";
  const label = props.kind === "rating" ? "保存分级" : unban ? "解除封禁" : "封禁用户";
  const Icon = pending ? LoaderCircle : props.kind === "rating" ? Save : unban ? UserCheck : UserX;
  const unchanged = props.kind === "rating" && rating === props.rating;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.canWrite || inFlight.current || !reason.trim() || unchanged) return;
    const confirmation = props.kind === "rating"
      ? `确认将 ${props.displayName} 的当前版本分级从 ${props.rating} 改为 ${rating}？`
      : unban ? `确认解除 ${props.displayName} 的 Plum 封禁？`
        : `确认封禁 ${props.displayName}？该用户将无法登录和使用 Plum，现有登录会话将失效。`;
    if (!window.confirm(confirmation)) return;
    const payload: components["schemas"]["AdminMembershipUpdateRequest"] | components["schemas"]["AdminCharacterRatingRequest"] = props.kind === "membership"
      ? { status: unban ? "active" : "disabled", expected_status: props.status, reason: reason.trim() }
      : { content_rating: rating, expected_rating: props.rating, expected_content_version: props.contentVersion, reason: reason.trim() };
    inFlight.current = true;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const path = props.kind === "membership"
        ? `/users/${encodeURIComponent(props.id)}/membership`
        : `/characters/${encodeURIComponent(props.id)}/rating`;
      const result = await adminApiFetch<unknown>(path, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (props.kind === "membership") parseUserResponse(result);
      else parseCharacterResponse(result);
      setReason("");
      setSuccess(props.kind === "rating" ? "分级已更新" : unban ? "已解除封禁" : "用户已封禁");
      router.refresh();
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.code === "resource_conflict") {
        setError("数据已被更新，请核对刷新后的状态再提交。");
        router.refresh();
      } else setError(caught instanceof Error ? caught.message : "操作失败，请重试。");
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
      <label><span>操作原因</span><textarea required maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="submit" disabled={!props.canWrite || pending || unchanged || !reason.trim()}>
        <Icon size={15} />{pending ? "提交中" : label}
      </button>
    </fieldset>
    {error && <p className={styles.error} role="alert"><AlertTriangle size={15} />{error}</p>}
    {success && <p className={styles.success} role="status"><CheckCircle2 size={15} />{success}</p>}
  </form>;
}

import type { ReactNode } from "react";
import type { AdminSectionDefinition } from "../admin-sections/definition";
import { formatDateTime, identityCell, statusCell } from "../admin-sections/presentation";
import type { AuditEvent } from "./audit-contracts";
import { listAuditEvents } from "./data-source";
import { FILTERABLE_ACTIONS, METADATA_LABELS, actionLabel, resourceLabel } from "./labels";
import styles from "./audit.module.css";

/** 一个值可能是数组（如 `changed_fields`），铺平成一行，长的截断——审计格子不是正文容器。 */
function metadataValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map((item) => String(item)).join(" / ")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value ?? "");
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

/**
 * metadata 全量渲染，已知键换中文名，未知键原样显示键名。
 * 不做白名单：审计新增了字段却在页面上看不见，比多显示一个陌生键名危险得多。
 * 正文类的键在 `audit-contracts.ts` 里被整行拒绝，走不到这里。
 */
function metadataCell(event: AuditEvent): ReactNode {
  const entries = Object.entries(event.metadata ?? {}).filter(
    ([, value]) => value !== "" && value !== null && !(Array.isArray(value) && value.length === 0),
  );
  if (entries.length === 0) return <small className={styles.muted}>--</small>;
  return (
    <dl className={styles.metadata}>
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{METADATA_LABELS[key] ?? key}</dt>
          <dd>{metadataValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function actionCell(event: AuditEvent): ReactNode {
  return (
    <div className={styles.action}>
      <strong>{actionLabel(event.action)}</strong>
      <code>{event.action}</code>
      {/* 明文读取要一眼看见：那是这份账本里唯一碰到过角色正文的动作。 */}
      {event.plaintext && statusCell("明文", "warn")}
    </div>
  );
}

export const auditSection: AdminSectionDefinition = {
  section: "audit",
  config: {
    eyebrow: "AUDIT",
    title: "操作审计",
    description: "后台写操作与明文读取的完整账本，按时间倒序",
    // 后端按 open_id 精确匹配，不做模糊搜索——占位符必须说实话，否则运营会以为搜不到就是没有。
    searchPlaceholder: "按操作者 open_id 精确筛选",
    columns: ["时间", "操作者", "动作", "资源", "原因", "详情"],
    statusOptions: FILTERABLE_ACTIONS.map((action) => ({
      value: action,
      label: actionLabel(action),
    })),
  },
  async load(query) {
    const response = await listAuditEvents({
      actor: query.q,
      action: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      rows: response.data.map((event) => [
        formatDateTime(event.occurred_at),
        identityCell(event.actor_display_name ?? "已注销", event.actor_open_id),
        actionCell(event),
        identityCell(resourceLabel(event.resource_type), event.resource_id ?? "--"),
        event.reason ? <small key={`${event.id}-reason`}>{event.reason}</small> : <small className={styles.muted}>--</small>,
        metadataCell(event),
      ]),
      page: response.page,
    };
  },
};

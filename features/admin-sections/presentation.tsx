import type { ReactNode } from "react";
import styles from "./admin-section-page.module.css";

export function formatDateTime(value: string | null): string {
  if (!value) return "--";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function identityCell(name: string, id: string, secondary?: string): ReactNode {
  return (
    <div className={styles.identityCell}>
      <strong>{name}</strong>
      <code>{id}</code>
      {secondary && <small>{secondary}</small>}
    </div>
  );
}

export function statusCell(
  label: string,
  tone: "good" | "warn" | "muted" = "muted",
): ReactNode {
  return <span className={`${styles.status} ${styles[tone]}`}>{label}</span>;
}

export function stackedCell(primary: string, secondary: string, key: string): ReactNode {
  return (
    <div className={styles.stackCell} key={key}>
      <strong>{primary}</strong>
      <small>{secondary}</small>
    </div>
  );
}

export function planCell(plan: string, key: string): ReactNode {
  return <strong className={styles.plan} key={key}>{plan}</strong>;
}

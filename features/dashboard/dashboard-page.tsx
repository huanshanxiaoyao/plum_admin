import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  BadgeCheck,
  CircleUserRound,
  Clock3,
  FileClock,
  UsersRound,
} from "lucide-react";
import type { OverviewData } from "@/features/admin-resources/contracts";
import { getAdminOverview } from "@/features/admin-resources/data-source";
import { adminDataSourceMode } from "@/lib/bff/config";
import styles from "./dashboard-page.module.css";

const METRICS: readonly {
  key: keyof Pick<
    OverviewData,
    | "active_membership_count"
    | "active_public_character_count"
    | "creator_count"
    | "works_updated_last_7_days"
  >;
  label: string;
  note: string;
  icon: typeof UsersRound;
}[] = [
  {
    key: "active_membership_count",
    label: "Active Plum Membership",
    note: "仅统计 Plum 产品有效成员",
    icon: CircleUserRound,
  },
  {
    key: "active_public_character_count",
    label: "Active Public Character",
    note: "状态有效且公开可见",
    icon: BadgeCheck,
  },
  {
    key: "creator_count",
    label: "创作者",
    note: "拥有至少一个 Work 的公开资料",
    icon: UsersRound,
  },
  {
    key: "works_updated_last_7_days",
    label: "近 7 日更新 Work",
    note: "包含 Work、草稿或 Character 更新",
    icon: FileClock,
  },
];

const RESOURCES = [
  { href: "/characters", label: "查看角色", detail: "Character、Version 与 Work", icon: BadgeCheck },
  { href: "/creators", label: "查看创作者", detail: "公开资料与创作汇总", icon: UsersRound },
  { href: "/users", label: "查看用户", detail: "Plum Membership 与公开关联", icon: CircleUserRound },
] as const;

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export async function DashboardPage() {
  await connection();
  const fixtureMode = adminDataSourceMode() === "fixture";
  const overview = await getAdminOverview();
  const { data, meta } = overview;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span>OVERVIEW</span>
          <h1>工作台</h1>
          <p>更新时间 {formatTimestamp(data.generated_at)} · {meta.timezone}</p>
        </div>
      </header>

      <section className={styles.metrics} aria-label="核心指标">
        {METRICS.map(({ key, label, note, icon: Icon }) => (
          <article key={key} className={styles.metric}>
            <div>
              <span>{label}</span>
              <strong>{data[key].toLocaleString("zh-CN")}</strong>
            </div>
            <Icon size={19} aria-hidden="true" />
            <small>{note}</small>
          </article>
        ))}
      </section>

      <div className={styles.columns}>
        <section className={styles.dataSection}>
          <header>
            <UsersRound size={18} aria-hidden="true" />
            <h2>一期数据入口</h2>
          </header>
          <div className={styles.resourceList}>
            {RESOURCES.map(({ href, label, detail, icon: Icon }) => (
              <Link href={href} key={href}>
                <Icon size={18} aria-hidden="true" />
                <span><strong>{label}</strong><small>{detail}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.windowSection}>
          <header>
            <Clock3 size={18} aria-hidden="true" />
            <h2>统计窗口</h2>
          </header>
          <dl>
            <div><dt>开始</dt><dd>{formatTimestamp(data.window_started_at)}</dd></div>
            <div><dt>结束</dt><dd>{formatTimestamp(data.generated_at)}</dd></div>
            <div><dt>时区</dt><dd>{meta.timezone}</dd></div>
          </dl>
        </section>
      </div>

      <footer className={styles.connection}>
        <span className={styles.connectionDot} />
        <strong>{fixtureMode ? "验收数据" : "Admin API"}</strong>
        <span>{fixtureMode ? "Fixture" : "Remote"}</span>
        <code>{fixtureMode ? "deterministic dataset" : "server-side BFF"}</code>
      </footer>
    </div>
  );
}

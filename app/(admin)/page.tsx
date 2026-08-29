import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CircleAlert,
  CircleCheck,
  Clock3,
  Plus,
  UsersRound,
} from "lucide-react";
import { adminDataSourceMode } from "@/lib/bff/config";
import styles from "./dashboard.module.css";

const METRICS = [
  { label: "Plum 有效用户", icon: UsersRound },
  { label: "Active Character", icon: BadgeCheck },
  { label: "待人工审核", icon: BookOpenCheck },
  { label: "受限创作者", icon: CircleAlert },
] as const;

export default function DashboardPage() {
  const fixtureMode = adminDataSourceMode() === "fixture";
  const today = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span>OVERVIEW</span>
          <h1>工作台</h1>
          <p>{today} · Asia/Shanghai</p>
        </div>
        <Link className={styles.primaryAction} href="/characters">
          <Plus size={17} />
          新建官方角色
        </Link>
      </header>

      <section className={styles.metrics} aria-label="核心指标">
        {METRICS.map(({ label, icon: Icon }) => (
          <article key={label} className={styles.metric}>
            <div>
              <span>{label}</span>
              <strong>--</strong>
            </div>
            <Icon size={19} />
            <small>尚未同步</small>
          </article>
        ))}
      </section>

      <div className={styles.columns}>
        <section className={styles.dataSection}>
          <header>
            <div>
              <BookOpenCheck size={18} />
              <h2>待处理审核</h2>
            </div>
            <Link href="/moderation">
              查看全部 <ArrowRight size={15} />
            </Link>
          </header>
          <div className={styles.tableHeader}>
            <span>内容</span>
            <span>来源</span>
            <span>状态</span>
            <span>更新时间</span>
          </div>
          <div className={styles.empty}>
            <CircleCheck size={22} />
            <strong>暂无待处理数据</strong>
            <span>--</span>
          </div>
        </section>

        <section className={styles.activitySection}>
          <header>
            <div>
              <Clock3 size={18} />
              <h2>最近操作</h2>
            </div>
            <Link href="/audit" aria-label="查看操作审计">
              <ArrowRight size={16} />
            </Link>
          </header>
          <div className={styles.emptyActivity}>
            <span className={styles.activityMark} />
            <div>
              <strong>暂无操作记录</strong>
              <small>--</small>
            </div>
          </div>
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

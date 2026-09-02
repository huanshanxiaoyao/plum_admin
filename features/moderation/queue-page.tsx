import Link from "next/link";
import { ChevronRight, RotateCcw, Search } from "lucide-react";
import type { ModerationReviewListQuery, ModerationReviewSummary } from "../admin-resources/contracts";
import { getAdminModerationBacklog, listAdminModerationReviews } from "../admin-resources/data-source";
import { AdminApiError } from "../../lib/bff/client";
import { formatDateTime } from "../admin-sections/presentation";
import { HOLD_LABELS, REVIEW_STATUS_LABELS, holdTone, statusTone } from "./labels";
import styles from "./moderation.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

export type ModerationQueuePageProps = { searchParams: Promise<SearchParams> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allowed<T extends string>(value: string | undefined, options: readonly T[]): T | undefined {
  return options.includes(value as T) ? value as T : undefined;
}

function pageHref(query: ModerationReviewListQuery, cursor: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && key !== "cursor" && key !== "limit") params.set(key, String(value));
  }
  params.set("cursor", cursor);
  return `/moderation?${params.toString()}`;
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "muted" }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

/** 等待时长决定队列的紧迫度：超时兜底是"保持自见"，没有定时任务会把它推走。 */
function waitedFor(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / (60 * 24))} 天`;
}

function isOpen(item: ModerationReviewSummary): boolean {
  return item.status === "pending" || item.status === "reviewing";
}

export async function ModerationQueuePage({ searchParams }: ModerationQueuePageProps) {
  const params = await searchParams;
  const query: ModerationReviewListQuery = {
    cursor: first(params.cursor)?.trim() || undefined,
    limit: 50,
    status: allowed(first(params.status), ["pending", "reviewing", "released", "confined", "purged"]),
    risk_level: first(params.risk_level)?.trim().toLowerCase() || undefined,
    sort: allowed(first(params.sort), ["created_at.asc", "created_at.desc"]),
  };

  let result;
  let backlog;
  let loadError: AdminApiError | undefined;
  try {
    [result, backlog] = await Promise.all([listAdminModerationReviews(query), getAdminModerationBacklog()]);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    loadError = error;
  }
  const hasFilters = Object.entries(query).some(([key, value]) => value !== undefined && key !== "limit");

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span>MODERATION</span>
          <h1>内容复核</h1>
          <p>机审判定需人工确认的 Character 发布物。待审期间内容仅创作者自己可见。</p>
        </div>
        {backlog && (
          <dl className={styles.backlog} aria-label="队列积压">
            <div><dt>待处理</dt><dd>{backlog.data.open_count}</dd></div>
            <div><dt>未认领</dt><dd>{backlog.data.pending_count}</dd></div>
            <div><dt>最早等待</dt><dd>{backlog.data.oldest_created_at ? waitedFor(backlog.data.oldest_created_at) : "--"}</dd></div>
          </dl>
        )}
      </header>

      <form className={styles.toolbar} action="/moderation" method="get" aria-label="复核队列工具栏">
        <label className={styles.select}><select name="status" defaultValue={query.status ?? ""} aria-label="复核状态">
          <option value="">全部状态</option>
          <option value="pending">待认领</option><option value="reviewing">审核中</option>
          <option value="released">已放出</option><option value="confined">已自见</option><option value="purged">已下架</option>
        </select></label>
        <label className={`${styles.search} ${styles.risk}`}>
          <Search size={15} />
          <input name="risk_level" defaultValue={query.risk_level} placeholder="风险等级" aria-label="风险等级" />
        </label>
        <label className={styles.select}><select name="sort" defaultValue={query.sort ?? "created_at.asc"} aria-label="排序">
          <option value="created_at.asc">最早优先</option><option value="created_at.desc">最新优先</option>
        </select></label>
        <button className={styles.submit} type="submit"><Search size={15} />查询</button>
        {hasFilters && <Link className={styles.reset} href="/moderation" title="重置筛选"><RotateCcw size={15} />重置</Link>}
      </form>

      <section className={styles.table} aria-label="复核队列">
        <table>
          <thead><tr><th>角色</th><th>创作者</th><th>风险</th><th>机审标签</th><th>复核状态</th><th>可见性</th><th>等待</th></tr></thead>
          <tbody>
            {loadError || !result || result.data.length === 0 ? (
              <tr><td colSpan={7}>
                <div className={styles.empty}>
                  <span className={loadError ? styles.errorCode : styles.emptyMark}>{loadError?.status ?? "--"}</span>
                  <strong>{loadError ? "数据加载失败" : "队列为空"}</strong>
                  <small>{loadError?.message ?? "没有等待人工复核的发布物"}</small>
                </div>
              </td></tr>
            ) : result.data.map((item) => (
              <tr key={item.id}>
                <td><div className={styles.identity}>
                  <Link href={`/moderation/${encodeURIComponent(item.id)}`}>{item.display_name || "(无名称)"}</Link>
                  <code>{item.character_id}</code>
                  <small>v{item.version_number}</small>
                </div></td>
                <td><div className={styles.identity}><code>{item.owner_platform_user_id}</code></div></td>
                <td><Badge tone={item.risk_level === "high" ? "bad" : item.risk_level === "medium" ? "warn" : "muted"}>{item.risk_level || "--"}</Badge></td>
                <td><div className={styles.badgeStack}>
                  {item.machine_labels.length ? item.machine_labels.map((label) => <Badge key={label}>{label}</Badge>) : <span className={styles.none}>--</span>}
                </div></td>
                <td><div className={styles.badgeStack}>
                  <Badge tone={statusTone(item.status)}>{REVIEW_STATUS_LABELS[item.status]}</Badge>
                  {item.assigned_admin_open_id && isOpen(item) && <small className={styles.assignee}>{item.assigned_admin_open_id}</small>}
                </div></td>
                <td><div className={styles.badgeStack}>
                  <Badge tone={item.visibility === "public" ? "good" : "muted"}>{item.visibility}</Badge>
                  {item.moderation_hold !== "none" && <Badge tone={holdTone(item.moderation_hold)}>{HOLD_LABELS[item.moderation_hold]}</Badge>}
                </div></td>
                <td><div className={styles.identity}>
                  <strong>{isOpen(item) ? waitedFor(item.created_at) : "--"}</strong>
                  <small>{formatDateTime(item.created_at)}</small>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className={styles.pagination}>
        <span>{result?.data.length ?? 0} 条记录</span>
        {result?.page.has_more && result.page.next_cursor
          ? <Link href={pageHref(query, result.page.next_cursor)} aria-label="下一页" title="下一页"><ChevronRight size={16} /></Link>
          : <button type="button" disabled aria-label="下一页"><ChevronRight size={16} /></button>}
      </footer>
    </div>
  );
}

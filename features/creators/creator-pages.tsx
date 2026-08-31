import Link from "next/link";
import { ArrowLeft, ChevronRight, ExternalLink, RotateCcw, Search } from "lucide-react";
import { notFound } from "next/navigation";
import type { CreatorListQuery } from "../admin-resources/contracts";
import { getAdminCreator, listAdminCreators } from "../admin-resources/data-source";
import { formatDateTime } from "../admin-sections/presentation";
import { AdminApiError } from "../../lib/bff/client";
import styles from "./creator-pages.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
export type CreatorListPageProps = { searchParams: Promise<SearchParams> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allowed<T extends string>(value: string | undefined, values: readonly T[]): T | undefined {
  return values.includes(value as T) ? value as T : undefined;
}

function date(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function nextPageHref(query: CreatorListQuery, cursor: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && key !== "cursor" && key !== "limit") params.set(key, String(value));
  }
  params.set("cursor", cursor);
  return `/creators?${params.toString()}`;
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "good" | "warn" | "muted" }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

function EmptyRow({ error }: { error?: AdminApiError }) {
  return <tr><td colSpan={6}><div className={styles.empty}>
    <span className={error ? styles.errorCode : styles.emptyMark}>{error?.status ?? "--"}</span>
    <strong>{error ? "数据加载失败" : "没有符合条件的数据"}</strong>
    <small>{error?.message ?? "调整筛选条件后重试"}</small>
  </div></td></tr>;
}

export async function CreatorListPage({ searchParams }: CreatorListPageProps) {
  const params = await searchParams;
  const query: CreatorListQuery = {
    q: first(params.q)?.trim() || undefined,
    status: allowed(first(params.status), ["active", "restricted"]),
    from: date(first(params.from)),
    to: date(first(params.to)),
    sort: allowed(first(params.sort), ["last_created_at.desc", "created_at.desc"]),
    cursor: first(params.cursor)?.trim() || undefined,
    limit: 50,
  };
  let result;
  let loadError: AdminApiError | undefined;
  try {
    result = await listAdminCreators(query);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    loadError = error;
  }
  const hasFilters = Object.entries(query).some(([key, value]) =>
    value !== undefined && key !== "limit" && !(key === "sort" && value === "last_created_at.desc"));

  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><span>CREATORS</span><h1>创作者</h1><p>查看公开资料、创作产出与内容表现</p></div></header>

    <form className={styles.toolbar} action="/creators" method="get" aria-label="创作者列表工具栏">
      <label className={styles.search}><Search size={15} /><input type="search" name="q" defaultValue={query.q} placeholder="用户 ID、Profile ID、名称或 Handle" /></label>
      <label className={styles.control}><span>资格</span><select name="status" defaultValue={query.status ?? ""} aria-label="创作者资格">
        <option value="">全部</option><option value="active">正常</option><option value="restricted">受限</option>
      </select></label>
      <label className={styles.control}><span>创建自</span><input type="date" name="from" defaultValue={query.from} aria-label="创建日期从（含）" /></label>
      <label className={styles.control}><span>创建至</span><input type="date" name="to" defaultValue={query.to} aria-label="创建日期到（不含）" /></label>
      <label className={styles.control}><span>排序</span><select name="sort" defaultValue={query.sort ?? "last_created_at.desc"} aria-label="创作者排序">
        <option value="last_created_at.desc">最近创作</option><option value="created_at.desc">最近加入</option>
      </select></label>
      <button className={styles.submit} type="submit"><Search size={15} />查询</button>
      {hasFilters && <Link className={styles.reset} href="/creators" title="重置筛选"><RotateCcw size={15} />重置</Link>}
    </form>

    <section className={styles.table} aria-label="创作者列表"><table>
      <thead><tr><th>创作者</th><th>资格</th><th>创作资产</th><th>内容结果</th><th>公开表现</th><th>最近创作</th></tr></thead>
      <tbody>{loadError || !result || result.data.length === 0 ? <EmptyRow error={loadError} /> : result.data.map((item) => <tr key={item.platform_user_id}>
        <td><div className={styles.identity}><Link href={`/creators/${encodeURIComponent(item.platform_user_id)}`}>{item.display_name}</Link><span>@{item.handle}</span><code>{item.platform_user_id}</code></div></td>
        <td><div className={styles.badgeStack}><Badge tone={item.control_status === "active" ? "good" : "warn"}>{item.control_status === "active" ? "正常" : "受限"}</Badge><Badge>{item.profile_status}</Badge></div></td>
        <td><div className={styles.metrics}><strong>{item.work_count.toLocaleString()} Work</strong><small>{item.draft_count.toLocaleString()} 草稿</small></div></td>
        <td><div className={styles.metrics}><strong>{item.published_count.toLocaleString()} 已发布</strong><small>{item.rejected_count.toLocaleString()} 拒绝 · {item.takedown_count.toLocaleString()} 下架</small></div></td>
        <td><div className={styles.metrics}><strong>{item.interaction_count.toLocaleString()} 互动</strong><small>{item.like_count.toLocaleString()} 赞 · {item.favorite_count.toLocaleString()} 收藏</small></div></td>
        <td>{formatDateTime(item.last_created_at)}</td>
      </tr>)}</tbody>
    </table></section>
    <footer className={styles.pagination}><span>{result?.data.length ?? 0} 条记录</span>
      {result?.page.has_more && result.page.next_cursor ? <Link href={nextPageHref(query, result.page.next_cursor)} aria-label="下一页" title="下一页"><ChevronRight size={16} /></Link> : <button type="button" disabled aria-label="下一页"><ChevronRight size={16} /></button>}
    </footer>
  </div>;
}

function value(label: string, content: React.ReactNode) {
  return <div className={styles.value}><dt>{label}</dt><dd>{content ?? "--"}</dd></div>;
}

export async function CreatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let response;
  try {
    response = await getAdminCreator(id);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    if (error instanceof AdminApiError) return <div className={styles.detailError}><strong>{error.status} · 数据加载失败</strong><span>{error.message}</span></div>;
    throw error;
  }
  const creator = response.data;
  const ownerQuery = encodeURIComponent(creator.platform_user_id);
  return <article className={styles.detailPage}>
    <Link className={styles.back} href="/creators"><ArrowLeft size={15} />返回创作者列表</Link>
    <header className={styles.detailHeader}><div><span>CREATOR</span><h1>{creator.display_name}</h1><p>@{creator.handle}</p></div><div className={styles.badgeStack}><Badge tone={creator.control_status === "active" ? "good" : "warn"}>{creator.control_status === "active" ? "资格正常" : "资格受限"}</Badge><Badge>{creator.profile_status}</Badge></div></header>

    <section className={styles.band} aria-labelledby="creator-profile"><h2 id="creator-profile">身份与资料</h2><dl className={styles.valueGrid}>
      {value("用户 ID", creator.platform_user_id)}
      {value("Profile ID", creator.profile_id)}
      {value("公开 Handle", `@${creator.handle}`)}
      {value("加入时间", formatDateTime(creator.created_at))}
      {value("资料更新时间", formatDateTime(creator.updated_at))}
      {value("最近创作", formatDateTime(creator.last_created_at))}
    </dl></section>

    <section className={styles.band} aria-labelledby="creator-output"><h2 id="creator-output">创作产出</h2><dl className={styles.valueGrid}>
      {value("Work", creator.work_count.toLocaleString())}
      {value("草稿", creator.draft_count.toLocaleString())}
      {value("已发布", creator.published_count.toLocaleString())}
      {value("已拒绝", creator.rejected_count.toLocaleString())}
      {value("已下架", creator.takedown_count.toLocaleString())}
      {value("最近发布", formatDateTime(creator.last_published_at ?? null))}
    </dl></section>

    <section className={styles.band} aria-labelledby="creator-performance"><h2 id="creator-performance">公开内容表现</h2><dl className={styles.valueGrid}>
      {value("互动", creator.interaction_count.toLocaleString())}
      {value("点赞", creator.like_count.toLocaleString())}
      {value("收藏", creator.favorite_count.toLocaleString())}
    </dl></section>

    <nav className={styles.related} aria-label="创作者关联内容">
      <Link href={`/characters?view=characters&q=${ownerQuery}`}>查看 Character<ExternalLink size={13} /></Link>
      <Link href={`/characters?view=works&owner=${ownerQuery}`}>查看 Work / 草稿<ExternalLink size={13} /></Link>
    </nav>
  </article>;
}

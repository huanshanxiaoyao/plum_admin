import Link from "next/link";
import { ChevronRight, RotateCcw, Search, Upload } from "lucide-react";
import type { CharacterListQuery, WorkListQuery } from "../admin-resources/contracts";
import { listAdminCharacters, listAdminWorks } from "../admin-resources/data-source";
import { AdminApiError } from "../../lib/bff/client";
import { getCurrentIdentity } from "../../lib/auth/session";
import { canUseImports } from "../imports/access";
import { formatDateTime } from "../admin-sections/presentation";
import { MyCharactersWorkspace } from "./my-characters-workspace";
import styles from "./content-page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type ContentView = "characters" | "works" | "mine";

export type ContentPageProps = { searchParams: Promise<SearchParams> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allowed<T extends string>(value: string | undefined, options: readonly T[]): T | undefined {
  return options.includes(value as T) ? value as T : undefined;
}

function pageHref(view: ContentView, query: Record<string, string | number | undefined>, cursor: string): string {
  const params = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && key !== "cursor" && key !== "limit") params.set(key, String(value));
  }
  params.set("cursor", cursor);
  return `/characters?${params.toString()}`;
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "good" | "warn" | "muted" }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

function ContentHeader({ view, showImportEntry }: { view: ContentView; showImportEntry: boolean }) {
  return (
    <header className={styles.pageHeader}>
      <div><span>CONTENT</span><h1>角色管理</h1><p>查看线上角色、创作流程与指定账号的角色表现</p></div>
      <div className={styles.headerActions}>
        <nav className={styles.tabs} aria-label="内容视图">
          <Link className={view === "characters" ? styles.activeTab : undefined} href="/characters?view=characters">全部角色</Link>
          <Link className={view === "works" ? styles.activeTab : undefined} href="/characters?view=works">Work / 草稿</Link>
          <Link className={view === "mine" ? styles.activeTab : undefined} href="/characters?view=mine">我的角色</Link>
        </nav>
        {showImportEntry && (
          <Link className={styles.importEntry} href="/imports">
            <Upload size={14} />
            批量导入
          </Link>
        )}
      </div>
    </header>
  );
}

function EmptyRow({ columns, error }: { columns: number; error?: AdminApiError }) {
  return (
    <tr><td colSpan={columns}>
      <div className={styles.empty}>
        <span className={error ? styles.errorCode : styles.emptyMark}>{error?.status ?? "--"}</span>
        <strong>{error ? "数据加载失败" : "没有符合条件的数据"}</strong>
        <small>{error?.message ?? "调整筛选条件后重试"}</small>
      </div>
    </td></tr>
  );
}

function CharacterFilters({ query }: { query: CharacterListQuery }) {
  return (
    <>
      <label className={styles.select}><select name="status" defaultValue={query.status ?? ""} aria-label="角色状态">
        <option value="">全部状态</option><option value="draft">Draft</option><option value="active">Active</option>
        <option value="takedown">已下架</option><option value="archived">已归档</option>
      </select></label>
      <label className={styles.select}><select name="rating" defaultValue={query.rating ?? ""} aria-label="内容评级">
        <option value="">全部评级</option><option value="general">General</option><option value="mature">Mature</option>
      </select></label>
      <label className={styles.select}><select name="visibility" defaultValue={query.visibility ?? ""} aria-label="可见性">
        <option value="">全部可见性</option><option value="public">Public</option><option value="private">Private</option>
      </select></label>
      <label className={styles.select}><select name="source" defaultValue={query.source ?? ""} aria-label="来源">
        <option value="">全部来源</option><option value="official">Official</option><option value="ugc">UGC</option>
      </select></label>
      <label className={styles.select}><select name="sort" defaultValue={query.sort ?? "created_at.desc"} aria-label="排序">
        <option value="created_at.desc">创建时间倒序</option><option value="created_at.asc">创建时间正序</option>
        <option value="updated_at.desc">更新时间倒序</option><option value="updated_at.asc">更新时间正序</option>
      </select></label>
    </>
  );
}

function WorkFilters({ query }: { query: WorkListQuery }) {
  return (
    <>
      <label className={styles.select}><select name="state" defaultValue={query.state ?? ""} aria-label="Work 状态">
        <option value="">全部状态</option><option value="draft">Draft</option><option value="published">Published</option>
        <option value="archived">Archived</option>
      </select></label>
      <label className={styles.select}><select name="moderation" defaultValue={query.moderation ?? ""} aria-label="审核状态">
        <option value="">全部审核状态</option><option value="not_submitted">未提交</option>
        <option value="pending_review">待审核</option><option value="published_pending_review">已发布·待复核</option>
        <option value="approved">已通过</option><option value="rejected">已拒绝</option>
      </select></label>
      <label className={`${styles.search} ${styles.owner}`}><input name="owner" defaultValue={query.owner} placeholder="Owner ID 或名称" aria-label="Owner" /></label>
      <label className={styles.select}><select name="sort" defaultValue={query.sort ?? "updated_at.desc"} aria-label="排序">
        <option value="updated_at.desc">更新时间倒序</option><option value="updated_at.asc">更新时间正序</option>
        <option value="created_at.desc">创建时间倒序</option><option value="created_at.asc">创建时间正序</option>
      </select></label>
    </>
  );
}

export async function ContentPage({ searchParams }: ContentPageProps) {
  const params = await searchParams;
  const requestedView = first(params.view);
  const view: ContentView = requestedView === "works" ? "works" : requestedView === "mine" ? "mine" : "characters";
  const identity = await getCurrentIdentity();
  const showImportEntry = identity ? canUseImports(identity.capabilities) : false;

  if (view === "mine") {
    return (
      <div className={styles.page}>
        <ContentHeader view={view} showImportEntry={showImportEntry} />
        <MyCharactersWorkspace operatorId={identity?.id ?? "unknown"} />
      </div>
    );
  }

  const q = first(params.q)?.trim() || undefined;
  const cursor = first(params.cursor)?.trim() || undefined;
  const characterQuery: CharacterListQuery = {
    q,
    cursor,
    limit: 50,
    status: allowed(first(params.status), ["draft", "active", "takedown", "archived"]),
    rating: allowed(first(params.rating), ["general", "mature"]),
    visibility: allowed(first(params.visibility), ["public", "private"]),
    source: allowed(first(params.source), ["official", "ugc"]),
    sort: allowed(first(params.sort), ["created_at.desc", "created_at.asc", "updated_at.desc", "updated_at.asc"]),
  };
  const workQuery: WorkListQuery = {
    q,
    cursor,
    limit: 50,
    owner: first(params.owner)?.trim() || undefined,
    state: allowed(first(params.state), ["draft", "published", "archived"]),
    moderation: allowed(first(params.moderation), ["not_submitted", "pending_review", "published_pending_review", "approved", "rejected"]),
    sort: allowed(first(params.sort), ["updated_at.desc", "updated_at.asc", "created_at.desc", "created_at.asc"]),
  };

  let result;
  let loadError: AdminApiError | undefined;
  try {
    result = view === "characters" ? await listAdminCharacters(characterQuery) : await listAdminWorks(workQuery);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    loadError = error;
  }
  // 运营的心智起点是角色列表，"再补一批角色"的念头在这一页产生。一级导航有入口，
  // 但要求人先想到"这件事叫批量导入"才找得到——次级入口把它放在动机出现的地方。
  const activeQuery = view === "characters" ? characterQuery : workQuery;
  const hasFilters = Object.entries(activeQuery).some(([key, value]) => value !== undefined && key !== "limit");

  return (
    <div className={styles.page}>
      <ContentHeader view={view} showImportEntry={showImportEntry} />

      <form className={styles.toolbar} action="/characters" method="get" aria-label="内容列表工具栏">
        <input type="hidden" name="view" value={view} />
        <label className={styles.search}><Search size={15} /><input type="search" name="q" defaultValue={q} placeholder={view === "characters" ? "搜索角色 ID、名称或创作者" : "搜索 Work ID、名称或 Owner"} /></label>
        {view === "characters" ? <CharacterFilters query={characterQuery} /> : <WorkFilters query={workQuery} />}
        <button className={styles.submit} type="submit"><Search size={15} />查询</button>
        {hasFilters && <Link className={styles.reset} href={`/characters?view=${view}`} title="重置筛选"><RotateCcw size={15} />重置</Link>}
      </form>

      <section className={styles.table} aria-label={view === "characters" ? "Character 列表" : "Work 列表"}>
        {view === "characters" ? (
          <table><thead><tr><th>角色</th><th>来源</th><th>创作者</th><th>状态</th><th>评级 / 可见性</th><th>统计</th><th>更新时间</th></tr></thead>
            <tbody>{loadError || !result || result.data.length === 0 ? <EmptyRow columns={7} error={loadError} /> : result.data.map((item) => "creator" in item && (
              <tr key={item.id}>
                <td><div className={styles.identity}><Link href={`/characters/${encodeURIComponent(item.id)}`}>{item.display_name}</Link><code>{item.id}</code><small>内容 v{item.content_version} · Prompt v{item.prompt_version}</small></div></td>
                <td><Badge tone={item.source === "official" ? "good" : "muted"}>{item.source === "official" ? "Official" : "UGC"}</Badge></td>
                <td><div className={styles.identity}><strong>{item.creator.display_name}</strong><code>{item.creator.platform_user_id ?? item.creator.profile_id}</code></div></td>
                <td><Badge tone={item.status === "active" ? "good" : item.status === "takedown" ? "warn" : "muted"}>{item.status}</Badge></td>
                <td><div className={styles.badgeStack}><Badge tone={item.content_rating === "mature" ? "warn" : "muted"}>{item.content_rating}</Badge><Badge>{item.visibility}</Badge></div></td>
                <td><div className={styles.metrics}><span>{item.stats.interaction_count.toLocaleString()} 互动</span><small>{item.stats.like_count.toLocaleString()} 赞 · {item.stats.favorite_count.toLocaleString()} 收藏</small></div></td>
                <td>{formatDateTime(item.updated_at)}</td>
              </tr>
            ))}</tbody></table>
        ) : (
          <table><thead><tr><th>Work</th><th>来源</th><th>Owner</th><th>生命周期</th><th>State</th><th>审核</th><th>更新时间</th></tr></thead>
            <tbody>{loadError || !result || result.data.length === 0 ? <EmptyRow columns={7} error={loadError} /> : result.data.map((item) => "owner" in item && (
              <tr key={item.id}>
                <td><div className={styles.identity}><Link href={`/works/${encodeURIComponent(item.id)}`}>{item.display_name}</Link><code>{item.id}</code><small>{item.revision ? `Revision ${item.revision}` : "尚无 Revision"}</small></div></td>
                <td><Badge tone={item.source === "official" ? "good" : "muted"}>{item.source === "official" ? "Official" : "UGC"}</Badge></td>
                <td><div className={styles.identity}><strong>{item.owner.display_name}</strong><code>{item.owner.platform_user_id ?? item.owner.profile_id}</code></div></td>
                <td><Badge tone={item.lifecycle_status === "active" ? "good" : "muted"}>{item.lifecycle_status}</Badge></td>
                <td><Badge tone={item.state === "published" ? "good" : "muted"}>{item.state}</Badge></td>
                <td><Badge tone={item.moderation === "approved" ? "good" : item.moderation === "rejected" || item.moderation === "published_pending_review" ? "warn" : "muted"}>{item.moderation}</Badge></td>
                <td>{formatDateTime(item.updated_at)}</td>
              </tr>
            ))}</tbody></table>
        )}
      </section>

      <footer className={styles.pagination}>
        <span>{result?.data.length ?? 0} 条记录</span>
        {result?.page.has_more && result.page.next_cursor ? <Link href={pageHref(view, activeQuery, result.page.next_cursor)} aria-label="下一页" title="下一页"><ChevronRight size={16} /></Link> : <button type="button" disabled aria-label="下一页"><ChevronRight size={16} /></button>}
      </footer>
    </div>
  );
}

import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronRight, ExternalLink, RotateCcw, Search } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminApiError } from "../../lib/bff/client";
import type { UserListQuery } from "../admin-resources/contracts";
import { adminApiWritesEnabled, adminDataSourceMode } from "../../lib/bff/config";
import { getAdminUser, getAdminUserWallet, listAdminUsers } from "../admin-resources/data-source";
import { formatDateTime } from "../admin-sections/presentation";
import { CrystalGrantForm } from "./crystal-grant-form";
import styles from "./user-pages.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
export type UserListPageProps = { searchParams: Promise<SearchParams> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allowed<T extends string>(value: string | undefined, values: readonly T[]): T | undefined {
  return values.includes(value as T) ? value as T : undefined;
}

function date(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function nextPageHref(query: UserListQuery, cursor: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && key !== "cursor" && key !== "limit") params.set(key, String(value));
  }
  params.set("cursor", cursor);
  return `/users?${params.toString()}`;
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

export async function UserListPage({ searchParams }: UserListPageProps) {
  const params = await searchParams;
  const query: UserListQuery = {
    q: first(params.q)?.trim() || undefined,
    status: allowed(first(params.status), ["active", "disabled"]),
    created_from: date(first(params.created_from)),
    created_to: date(first(params.created_to)),
    sort: allowed(first(params.sort), ["last_activity_at.desc", "created_at.desc"]),
    cursor: first(params.cursor)?.trim() || undefined,
    limit: 50,
  };
  let result;
  let loadError: AdminApiError | undefined;
  try {
    result = await listAdminUsers(query);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    loadError = error;
  }
  const hasFilters = Object.entries(query).some(([key, value]) =>
    value !== undefined && key !== "limit" && !(key === "sort" && value === "last_activity_at.desc"));

  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><span>USERS</span><h1>用户</h1><p>查看 Plum Membership、公开资料与创作资产摘要</p></div></header>

    <form className={styles.toolbar} action="/users" method="get" aria-label="用户列表工具栏">
      <label className={styles.search}><Search size={15} /><input type="search" name="q" defaultValue={query.q} placeholder="用户 ID、名称或公开 Handle" /></label>
      <label className={styles.control}><span>Membership</span><select name="status" defaultValue={query.status ?? ""} aria-label="Membership 状态">
        <option value="">全部</option><option value="active">正常</option><option value="disabled">已禁用</option>
      </select></label>
      <label className={styles.control}><span>加入自</span><input type="date" name="created_from" defaultValue={query.created_from} aria-label="加入日期从（含）" /></label>
      <label className={styles.control}><span>加入至</span><input type="date" name="created_to" defaultValue={query.created_to} aria-label="加入日期到（不含）" /></label>
      <label className={styles.control}><span>排序</span><select name="sort" defaultValue={query.sort ?? "last_activity_at.desc"} aria-label="用户排序">
        <option value="last_activity_at.desc">最近活跃</option><option value="created_at.desc">最近加入</option>
      </select></label>
      <button className={styles.submit} type="submit"><Search size={15} />查询</button>
      {hasFilters && <Link className={styles.reset} href="/users" title="重置筛选"><RotateCcw size={15} />重置</Link>}
    </form>

    <section className={styles.table} aria-label="用户列表"><table>
      <thead><tr><th>用户</th><th>Plum Membership</th><th>公开资料</th><th>创作资产</th><th>最近活跃</th><th>加入时间</th></tr></thead>
      <tbody>{loadError || !result || result.data.length === 0 ? <EmptyRow error={loadError} /> : result.data.map((item) => <tr key={item.platform_user_id}>
        <td><div className={styles.identity}><Link href={`/users/${encodeURIComponent(item.platform_user_id)}`}>{item.display_name}</Link><code>{item.platform_user_id}</code><span>{item.masked_login_identifier}</span></div></td>
        <td><Badge tone={item.membership_status === "active" ? "good" : "warn"}>{item.membership_status === "active" ? "正常" : "已禁用"}</Badge></td>
        <td>{item.profile_id ? <div className={styles.metrics}><strong>{item.profile_handle ? `@${item.profile_handle}` : "已有公开资料"}</strong><small>{item.is_creator ? "创作者" : "普通用户"}</small></div> : <span className={styles.placeholder}>未创建</span>}</td>
        <td><div className={styles.metrics}><strong>{item.work_count.toLocaleString()} Work</strong><small>{item.character_count.toLocaleString()} Character</small></div></td>
        <td>{formatDateTime(item.last_activity_at ?? null)}</td>
        <td>{formatDateTime(item.created_at)}</td>
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

function walletErrorText(error: AdminApiError): string {
  if (error.code === "membership_inactive") return "该用户的 Plum Membership 未启用，不能查询钱包或充值。";
  if (error.code === "wallet_account_unavailable") return "该用户没有有效的 Plum 账号，不能查询钱包或充值。";
  if (error.code === "wallet_account_conflict") return "该用户的 Plum 账号归属数据不一致，请先修复账号归属。";
  return `钱包加载失败（${error.status}）：${error.message}`;
}

export async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let response;
  try {
    response = await getAdminUser(id);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    if (error instanceof AdminApiError) return <div className={styles.detailError}><strong>{error.status} · 数据加载失败</strong><span>{error.message}</span></div>;
    throw error;
  }
  const user = response.data;
  let wallet;
  let walletError: AdminApiError | undefined;
  if (user.membership_status === "active") {
    try {
      wallet = await getAdminUserWallet(user.platform_user_id);
    } catch (error) {
      if (!(error instanceof AdminApiError)) throw error;
      walletError = error;
    }
  }
  const remoteMode = adminDataSourceMode() === "remote";
  const canWrite = remoteMode && adminApiWritesEnabled();
  const blockedReason = !remoteMode
    ? "当前是 fixture 数据源，人工充值不可用。"
    : "Admin API 写入未启用（ADMIN_API_WRITE_ENABLED），人工充值不可用。";
  const ownerQuery = encodeURIComponent(user.platform_user_id);
  return <article className={styles.detailPage}>
    <Link className={styles.back} href="/users"><ArrowLeft size={15} />返回用户列表</Link>
    <header className={styles.detailHeader}><div><span>USER</span><h1>{user.display_name}</h1><p>{user.platform_user_id}</p></div><Badge tone={user.membership_status === "active" ? "good" : "warn"}>{user.membership_status === "active" ? "Membership 正常" : "Membership 已禁用"}</Badge></header>

    <section className={styles.band} aria-labelledby="user-identity"><h2 id="user-identity">身份与 Membership</h2><dl className={styles.valueGrid}>
      {value("用户 ID", user.platform_user_id)}
      {value("登录标识", user.masked_login_identifier)}
      {value("Membership", user.membership_status === "active" ? "正常" : "已禁用")}
      {value("加入时间", formatDateTime(user.created_at))}
      {value("更新时间", formatDateTime(user.updated_at))}
      {value("最近活跃", formatDateTime(user.last_activity_at ?? null))}
    </dl></section>

    <section className={styles.band} aria-labelledby="user-profile"><h2 id="user-profile">公开资料与创作</h2><dl className={styles.valueGrid}>
      {value("Profile ID", user.profile_id ?? "--")}
      {value("公开 Handle", user.profile_handle ? `@${user.profile_handle}` : "--")}
      {value("创作者", user.is_creator ? "是" : "否")}
      {value("Work", user.work_count.toLocaleString())}
      {value("Character", user.character_count.toLocaleString())}
    </dl></section>

    <section className={`${styles.band} ${styles.walletBand}`} aria-labelledby="user-wallet">
      <h2 id="user-wallet">水晶钱包</h2>
      <div className={styles.walletContent}>
        {user.membership_status !== "active" ? (
          <p className={styles.walletUnavailable}><AlertTriangle size={14} />Membership 已禁用，不能查询钱包或充值。</p>
        ) : walletError || !wallet ? (
          <p className={styles.walletUnavailable}><AlertTriangle size={14} />{walletError ? walletErrorText(walletError) : "钱包暂不可用。"}</p>
        ) : (
          <>
            <dl className={styles.walletSummary}>
              {value("当前余额", `${wallet.data.balance.toLocaleString("zh-CN")} 水晶`)}
              {value("有期限余额", `${wallet.data.expiring_total.toLocaleString("zh-CN")} 水晶`)}
              {value("永久余额", `${wallet.data.never_expires.toLocaleString("zh-CN")} 水晶`)}
            </dl>
            <div className={styles.expiryLots}>
              <h3>到期批次</h3>
              {wallet.data.expiring.length === 0 ? <span>暂无</span> : <ul>{wallet.data.expiring.map((lot) => (
                <li key={`${lot.expires_at}-${lot.amount_micros}`}>
                  <strong>{lot.amount.toLocaleString("zh-CN")} 水晶</strong>
                  <span>{formatDateTime(lot.expires_at)} 到期</span>
                </li>
              ))}</ul>}
            </div>
            <CrystalGrantForm
              platformUserId={user.platform_user_id}
              displayName={user.display_name}
              canWrite={canWrite}
              blockedReason={blockedReason}
            />
          </>
        )}
      </div>
    </section>

    {user.is_creator && <nav className={styles.related} aria-label="用户关联内容">
      <Link href={`/creators/${ownerQuery}`}>查看 Creator<ExternalLink size={13} /></Link>
      <Link href={`/characters?view=works&owner=${ownerQuery}`}>查看 Work / 草稿<ExternalLink size={13} /></Link>
      <Link href={`/characters?view=characters&q=${ownerQuery}`}>查看 Character<ExternalLink size={13} /></Link>
    </nav>}
  </article>;
}

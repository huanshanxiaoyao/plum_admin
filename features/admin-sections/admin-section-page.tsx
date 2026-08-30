import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Filter, RotateCcw, Search } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { adminModuleForSection, isModuleAvailable } from "../admin-navigation/modules";
import type { AdminListQuery } from "../admin-resources/contracts";
import { getCurrentIdentity } from "../../lib/auth/session";
import { AdminApiError } from "../../lib/bff/client";
import { adminDataSourceMode } from "../../lib/bff/config";
import type { AdminSectionDefinition, SectionLoadResult } from "./definition";
import styles from "./admin-section-page.module.css";

export type AdminSectionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function nextPageHref(
  href: string,
  q: string | undefined,
  statusValue: string | undefined,
  cursor: string,
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (statusValue) params.set("status", statusValue);
  params.set("cursor", cursor);
  return `${href}?${params.toString()}`;
}

export async function AdminSectionPage({
  definition,
  searchParams,
}: AdminSectionPageProps & { definition: AdminSectionDefinition }): Promise<ReactNode> {
  const adminModule = adminModuleForSection(definition.section);
  if (!adminModule) notFound();

  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  if (!isModuleAvailable(adminModule, adminDataSourceMode())) notFound();
  if (!identity.capabilities.includes(adminModule.capability)) redirect("/forbidden");

  const queryParams = await searchParams;
  const query: AdminListQuery = {
    q: firstParam(queryParams.q)?.trim() || undefined,
    status: firstParam(queryParams.status)?.trim() || undefined,
    cursor: firstParam(queryParams.cursor)?.trim() || undefined,
    limit: 50,
  };
  let result: SectionLoadResult | null = null;
  let loadError: AdminApiError | null = null;
  if (definition.load) {
    try {
      result = await definition.load(query, { identity });
    } catch (error) {
      if (!(error instanceof AdminApiError)) throw error;
      loadError = error;
    }
  }

  const { config } = definition;
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span>{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
      </header>

      <form className={styles.toolbar} action={adminModule.href} method="get" aria-label="列表工具栏">
        <label className={styles.search}>
          <Search size={16} />
          <input
            type="search"
            name="q"
            placeholder={config.searchPlaceholder}
            defaultValue={query.q}
            disabled={!definition.load}
          />
        </label>
        {config.statusOptions ? (
          <label className={styles.select}>
            <Filter size={16} />
            <select name="status" defaultValue={query.status ?? ""}>
              <option value="">全部状态</option>
              {config.statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <button type="button" disabled title="筛选"><Filter size={16} />筛选</button>
        )}
        {definition.load && <button type="submit"><Search size={16} />查询</button>}
        {(query.q || query.status) && (
          <Link className={styles.reset} href={adminModule.href} title="重置筛选">
            <RotateCcw size={16} />重置
          </Link>
        )}
      </form>

      <section className={styles.table} aria-label={`${config.title}列表`}>
        <table>
          <thead>
            <tr>
              {config.columns.map((column) => <th key={column} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {loadError ? (
              <tr><td colSpan={config.columns.length}>
                <div className={styles.empty}>
                  <span className={styles.errorCode}>{loadError.status}</span>
                  <strong>数据加载失败</strong>
                  <small>{loadError.message}</small>
                </div>
              </td></tr>
            ) : result && result.rows.length > 0 ? result.rows.map((cells, rowIndex) => (
              <tr key={`${definition.section}-${rowIndex}`}>
                {cells.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            )) : (
              <tr><td colSpan={config.columns.length}>
                <div className={styles.empty}>
                  <span className={styles.emptyMark}>--</span>
                  <strong>{definition.load ? "没有符合条件的数据" : "暂无数据"}</strong>
                  <small>{definition.load ? "调整筛选条件后重试" : "Admin API 尚未接入"}</small>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className={styles.pagination}>
        <span>{result?.rows.length ?? 0} 条记录</span>
        <div>
          {result?.page.has_more && result.page.next_cursor ? (
            <Link
              href={nextPageHref(adminModule.href, query.q, query.status, result.page.next_cursor)}
              aria-label="下一页"
              title="下一页"
            >
              <ChevronRight size={16} />
            </Link>
          ) : (
            <button type="button" disabled aria-label="下一页"><ChevronRight size={16} /></button>
          )}
        </div>
      </footer>
    </div>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Filter, RotateCcw, Search } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getCurrentIdentity } from "@/lib/auth/session";
import { listAdminResources } from "@/lib/admin/data-source";
import { adminModuleForSection, isModuleAvailable } from "@/lib/admin/modules";
import { StaffStatusAction } from "@/components/staff-status-action";
import type {
  AdminListResponseMap,
  AdminListSection,
  CharacterSummary,
  CreatorSummary,
  StaffSummary,
  SubscriptionSummary,
  UserSummary,
} from "@/lib/admin/contracts";
import { AdminApiError } from "@/lib/bff/client";
import { adminDataSourceMode } from "@/lib/bff/config";
import styles from "./section.module.css";

type StatusOption = { value: string; label: string };

type SectionConfig = {
  eyebrow: string;
  title: string;
  description: string;
  searchPlaceholder: string;
  columns: readonly string[];
  statusOptions?: readonly StatusOption[];
};

const SECTIONS: Record<string, SectionConfig> = {
  characters: {
    eyebrow: "CONTENT",
    title: "角色管理",
    description: "Character 与 Work",
    searchPlaceholder: "搜索角色 ID、名称或创作者",
    columns: ["角色", "来源", "创作者", "状态", "评级", "更新时间"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "takedown", label: "已下架" },
    ],
  },
  creators: {
    eyebrow: "CREATORS",
    title: "创作者",
    description: "资料、作品与创作资格",
    searchPlaceholder: "搜索用户 ID 或公开名称",
    columns: ["创作者", "资格", "草稿", "已发布", "被下架", "最近创作"],
    statusOptions: [
      { value: "active", label: "正常" },
      { value: "restricted", label: "受限" },
    ],
  },
  users: {
    eyebrow: "USERS",
    title: "用户",
    description: "Plum Membership 用户",
    searchPlaceholder: "搜索平台用户 ID 或显示名称",
    columns: ["用户", "Membership", "订阅", "角色数", "最近活跃"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "disabled", label: "Disabled" },
    ],
  },
  subscriptions: {
    eyebrow: "ENTITLEMENTS",
    title: "用户订阅",
    description: "订阅方案与当前状态（只读）",
    searchPlaceholder: "搜索平台用户 ID 或显示名称",
    columns: ["用户", "方案", "状态", "支付连接", "更新时间"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  audit: {
    eyebrow: "AUDIT",
    title: "操作审计",
    description: "后台操作与结果",
    searchPlaceholder: "搜索操作者或资源 ID",
    columns: ["时间", "操作者", "动作", "资源", "结果", "请求 ID"],
  },
  staff: {
    eyebrow: "ACCESS",
    title: "后台成员",
    description: "Operator 与 Admin",
    searchPlaceholder: "搜索姓名或 Open ID",
    columns: ["成员", "邮箱", "角色", "状态", "首次登录", "最近登录", "操作"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "disabled", label: "Disabled" },
    ],
  },
};

const LIST_SECTIONS = new Set<AdminListSection>([
  "characters",
  "creators",
  "users",
  "subscriptions",
  "staff",
]);

function isListSection(section: string): section is AdminListSection {
  return LIST_SECTIONS.has(section as AdminListSection);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null): string {
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

function identityCell(name: string, id: string, secondary?: string): ReactNode {
  return (
    <div className={styles.identityCell}>
      <strong>{name}</strong>
      <code>{id}</code>
      {secondary && <small>{secondary}</small>}
    </div>
  );
}

function status(label: string, tone: "good" | "warn" | "muted" = "muted"): ReactNode {
  return <span className={`${styles.status} ${styles[tone]}`}>{label}</span>;
}

function characterRows(items: CharacterSummary[]): ReactNode[][] {
  return items.map((item) => [
    identityCell(item.display_name, item.id, item.visibility === "private" ? "Private" : undefined),
    status(item.source === "official" ? "Official" : "UGC", item.source === "official" ? "good" : "muted"),
    identityCell(item.creator.display_name, item.creator.platform_user_id),
    status(item.status === "active" ? "Active" : "已下架", item.status === "active" ? "good" : "warn"),
    status(item.content_rating === "general" ? "General" : "Mature", item.content_rating === "mature" ? "warn" : "muted"),
    formatDateTime(item.updated_at),
  ]);
}

function creatorRows(items: CreatorSummary[]): ReactNode[][] {
  return items.map((item) => [
    identityCell(item.display_name, item.platform_user_id, item.profile_id),
    status(item.control_status === "active" ? "正常" : "受限", item.control_status === "active" ? "good" : "warn"),
    item.draft_count.toLocaleString("zh-CN"),
    item.published_count.toLocaleString("zh-CN"),
    item.takedown_count.toLocaleString("zh-CN"),
    formatDateTime(item.last_created_at),
  ]);
}

function userRows(items: UserSummary[]): ReactNode[][] {
  return items.map((item) => [
    identityCell(item.display_name, item.platform_user_id, item.masked_login),
    status(item.membership_status === "active" ? "Active" : "Disabled", item.membership_status === "active" ? "good" : "warn"),
    <div className={styles.stackCell} key={`${item.platform_user_id}-plan`}>
      <strong>{item.subscription.plan}</strong>
      <small>{item.subscription.status}</small>
    </div>,
    item.character_count.toLocaleString("zh-CN"),
    formatDateTime(item.last_active_at),
  ]);
}

function subscriptionRows(items: SubscriptionSummary[]): ReactNode[][] {
  return items.map((item) => [
    identityCell(item.display_name, item.platform_user_id),
    <strong className={styles.plan} key={`${item.id}-plan`}>{item.plan}</strong>,
    status(item.status === "active" ? "Active" : "Cancelled", item.status === "active" ? "good" : "muted"),
    status("未接支付", "warn"),
    formatDateTime(item.updated_at),
  ]);
}

function staffRows(items: StaffSummary[], canManage: boolean): ReactNode[][] {
  return items.map((item) => [
    identityCell(item.display_name, item.open_id, item.en_name ?? undefined),
    item.email || "--",
    status(item.role === "admin" ? "Admin" : "Operator", item.role === "admin" ? "good" : "muted"),
    status(item.status === "active" ? "Active" : "Disabled", item.status === "active" ? "good" : "warn"),
    formatDateTime(item.created_at),
    formatDateTime(item.last_login_at),
    canManage ? <StaffStatusAction key={item.open_id} member={item} /> : <span key={item.open_id}>只读</span>,
  ]);
}

function tableRows<Section extends AdminListSection>(
  section: Section,
  response: AdminListResponseMap[Section],
  canManageStaff: boolean,
): ReactNode[][] {
  switch (section) {
    case "characters":
      return characterRows(response.data as CharacterSummary[]);
    case "creators":
      return creatorRows(response.data as CreatorSummary[]);
    case "users":
      return userRows(response.data as UserSummary[]);
    case "subscriptions":
      return subscriptionRows(response.data as SubscriptionSummary[]);
    case "staff":
      return staffRows(response.data as StaffSummary[], canManageStaff);
  }
}

function nextPageHref(section: string, q: string | undefined, statusValue: string | undefined, cursor: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (statusValue) params.set("status", statusValue);
  params.set("cursor", cursor);
  return `/${section}?${params.toString()}`;
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const config = SECTIONS[section];
  const adminModule = adminModuleForSection(section);
  if (!config || !adminModule) notFound();

  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  if (!isModuleAvailable(adminModule, adminDataSourceMode())) notFound();
  if (!identity.capabilities.includes(adminModule.capability)) redirect("/forbidden");
  const queryParams = await searchParams;
  const q = firstParam(queryParams.q)?.trim() || undefined;
  const statusValue = firstParam(queryParams.status)?.trim() || undefined;
  const cursor = firstParam(queryParams.cursor)?.trim() || undefined;
  let response: AdminListResponseMap[AdminListSection] | null = null;
  let loadError: AdminApiError | null = null;
  if (isListSection(section)) {
    try {
      response = await listAdminResources(section, { q, status: statusValue, cursor, limit: 50 });
    } catch (error) {
      if (!(error instanceof AdminApiError)) throw error;
      loadError = error;
    }
  }
  const rows = response && isListSection(section)
    ? tableRows(section, response, identity.capabilities.includes("staff.manage"))
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span>{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
      </header>

      <form className={styles.toolbar} action={`/${section}`} method="get" aria-label="列表工具栏">
        <label className={styles.search}>
          <Search size={16} />
          <input type="search" name="q" placeholder={config.searchPlaceholder} defaultValue={q} disabled={!isListSection(section)} />
        </label>
        {config.statusOptions ? (
          <label className={styles.select}>
            <Filter size={16} />
            <select name="status" defaultValue={statusValue ?? ""}>
              <option value="">全部状态</option>
              {config.statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <button type="button" disabled title="筛选"><Filter size={16} />筛选</button>
        )}
        {isListSection(section) && <button type="submit"><Search size={16} />查询</button>}
        {(q || statusValue) && (
          <Link className={styles.reset} href={`/${section}`} title="重置筛选"><RotateCcw size={16} />重置</Link>
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
            ) : rows.length > 0 ? rows.map((cells, rowIndex) => (
              <tr key={`${section}-${rowIndex}`}>
                {cells.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            )) : (
              <tr><td colSpan={config.columns.length}>
                <div className={styles.empty}>
                  <span className={styles.emptyMark}>--</span>
                  <strong>{isListSection(section) ? "没有符合条件的数据" : "暂无数据"}</strong>
                  <small>{isListSection(section) ? "调整筛选条件后重试" : "Admin API 尚未接入"}</small>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className={styles.pagination}>
        <span>{response?.data.length ?? 0} 条记录</span>
        <div>
          {response?.page.has_more && response.page.next_cursor ? (
            <Link href={nextPageHref(section, q, statusValue, response.page.next_cursor)} aria-label="下一页" title="下一页">
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

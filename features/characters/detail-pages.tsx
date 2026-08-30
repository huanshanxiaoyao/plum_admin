import Link from "next/link";
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminApiError } from "../../lib/bff/client";
import { formatDateTime } from "../admin-sections/presentation";
import { getAdminCharacter, getAdminWork, listAdminCharacterVersions } from "../admin-resources/data-source";
import styles from "./detail-pages.module.css";

type DetailParams = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function value(label: string, content: React.ReactNode) {
  return <div className={styles.value}><dt>{label}</dt><dd>{content ?? "--"}</dd></div>;
}

function badge(label: string, tone: "good" | "warn" | "muted" = "muted") {
  return <span className={`${styles.badge} ${styles[tone]}`}>{label}</span>;
}

function DetailError({ error }: { error: AdminApiError }) {
  return <div className={styles.error}><strong>{error.status} · 数据加载失败</strong><span>{error.message}</span></div>;
}

async function loadCharacterDetail(id: string, cursor: string | undefined, sort: "created_at.asc" | "created_at.desc") {
  try {
    const [response, versions] = await Promise.all([
      getAdminCharacter(id),
      listAdminCharacterVersions(id, { cursor, sort, limit: 20 }),
    ]);
    return { ok: true as const, response, versions };
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    if (error instanceof AdminApiError) return { ok: false as const, error };
    throw error;
  }
}

async function loadWorkDetail(id: string) {
  try {
    return { ok: true as const, response: await getAdminWork(id) };
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    if (error instanceof AdminApiError) return { ok: false as const, error };
    throw error;
  }
}

export async function CharacterDetailPage({ params, searchParams }: { params: DetailParams; searchParams: SearchParams }) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams]);
  const cursor = first(queryParams.cursor)?.trim() || undefined;
  const sort = first(queryParams.sort) === "created_at.asc" ? "created_at.asc" : "created_at.desc";
  const loaded = await loadCharacterDetail(id, cursor, sort);
  if (!loaded.ok) return <DetailError error={loaded.error} />;
  const { response, versions } = loaded;
  const character = response.data;
    const nextHref = versions.page.next_cursor
      ? `/characters/${encodeURIComponent(id)}?sort=${sort}&cursor=${encodeURIComponent(versions.page.next_cursor)}`
      : null;
  return (
      <article className={styles.page}>
        <Link className={styles.back} href="/characters?view=characters"><ArrowLeft size={15} />返回 Character 列表</Link>
        <header className={styles.header}>
          <div><span>CHARACTER</span><h1>{character.display_name}</h1><code>{character.id}</code></div>
          <div className={styles.headerStatus}>{badge(character.status, character.status === "active" ? "good" : character.status === "takedown" ? "warn" : "muted")}{badge(character.visibility)}</div>
        </header>

        <section className={styles.band} aria-labelledby="character-governance"><h2 id="character-governance">治理信息</h2><dl className={styles.valueGrid}>
          {value("来源", character.source === "official" ? "Official" : "UGC")}
          {value("内容评级", character.content_rating)}
          {value("Work ID", <Link href={`/works/${encodeURIComponent(character.work_id)}`}>{character.work_id}<ExternalLink size={12} /></Link>)}
          {value("内容版本", `v${character.content_version}`)}
          {value("Prompt 版本", `v${character.prompt_version}`)}
          {value("发布时间", formatDateTime(character.published_at ?? null))}
          {value("创建时间", formatDateTime(character.created_at))}
          {value("更新时间", formatDateTime(character.updated_at))}
        </dl></section>

        <section className={styles.band} aria-labelledby="character-owner"><h2 id="character-owner">创作者与统计</h2><dl className={styles.valueGrid}>
          {value("创作者", character.creator.display_name)}
          {value("Profile ID", character.creator.profile_id)}
          {value("用户 ID", character.creator.platform_user_id ?? "--")}
          {value("互动", character.stats.interaction_count.toLocaleString())}
          {value("点赞", character.stats.like_count.toLocaleString())}
          {value("收藏", character.stats.favorite_count.toLocaleString())}
        </dl></section>

        <section className={styles.versions} aria-labelledby="character-versions"><div className={styles.sectionHeader}><div><h2 id="character-versions">版本记录</h2><p>仅展示不可变版本元数据，不包含 Prompt 或角色正文</p></div>
          <form action={`/characters/${encodeURIComponent(id)}`} method="get"><select name="sort" defaultValue={sort} aria-label="版本排序"><option value="created_at.desc">最新优先</option><option value="created_at.asc">最早优先</option></select><button type="submit">排序</button></form></div>
          <div className={styles.table}><table><thead><tr><th>版本</th><th>名称</th><th>Prompt</th><th>创作者评级</th><th>平台评级</th><th>可见性</th><th>策略版本</th><th>创建时间</th></tr></thead><tbody>
            {versions.data.length ? versions.data.map((version) => <tr key={`${version.character_id}-${version.version_number}`}><td>v{version.version_number}</td><td>{version.display_name}</td><td>v{version.prompt_version}</td><td>{version.creator_declared_rating}</td><td>{version.platform_effective_rating}</td><td>{version.visibility}</td><td>{version.access_policy_version}</td><td>{formatDateTime(version.created_at)}</td></tr>) : <tr><td colSpan={8} className={styles.empty}>暂无版本记录</td></tr>}
          </tbody></table></div>
          <footer className={styles.pagination}><span>{versions.data.length} 条版本记录</span>{nextHref ? <Link href={nextHref} aria-label="下一页版本"><ChevronRight size={16} /></Link> : <button type="button" disabled aria-label="下一页版本"><ChevronRight size={16} /></button>}</footer>
        </section>
      </article>
  );
}

export async function WorkDetailPage({ params }: { params: DetailParams }) {
  const { id } = await params;
  const loaded = await loadWorkDetail(id);
  if (!loaded.ok) return <DetailError error={loaded.error} />;
  const work = loaded.response.data;
  return (
      <article className={styles.page}>
        <Link className={styles.back} href="/characters?view=works"><ArrowLeft size={15} />返回 Work 列表</Link>
        <header className={styles.header}>
          <div><span>WORK</span><h1>{work.display_name}</h1><code>{work.id}</code></div>
          <div className={styles.headerStatus}>{badge(work.state, work.state === "published" ? "good" : "muted")}{badge(work.moderation, work.moderation === "approved" ? "good" : work.moderation === "rejected" ? "warn" : "muted")}</div>
        </header>

        <section className={styles.band} aria-labelledby="work-lifecycle"><h2 id="work-lifecycle">生命周期</h2><dl className={styles.valueGrid}>
          {value("来源", work.source === "official" ? "Official" : "UGC")}
          {value("生命周期", work.lifecycle_status)}
          {value("State", work.state)}
          {value("审核状态", work.moderation)}
          {value("Revision", work.revision ? `v${work.revision}` : "--")}
          {value("Published Character", work.published_character_id ? <Link href={`/characters/${encodeURIComponent(work.published_character_id)}`}>{work.published_character_id}<ExternalLink size={12} /></Link> : "--")}
          {value("提交时间", formatDateTime(work.submitted_at ?? null))}
          {value("审核时间", formatDateTime(work.reviewed_at ?? null))}
          {value("创建时间", formatDateTime(work.created_at))}
          {value("更新时间", formatDateTime(work.updated_at))}
        </dl></section>

        <section className={styles.band} aria-labelledby="work-owner"><h2 id="work-owner">Owner</h2><dl className={styles.valueGrid}>
          {value("显示名称", work.owner.display_name)}
          {value("Profile ID", work.owner.profile_id)}
          {value("用户 ID", work.owner.platform_user_id ?? "--")}
        </dl></section>
      </article>
  );
}

import Link from "next/link";
import { ArrowLeft, ExternalLink, Eye } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminApiError } from "../../lib/bff/client";
import { adminApiWritesEnabled, adminDataSourceMode } from "../../lib/bff/config";
import { formatDateTime } from "../admin-sections/presentation";
import { getAdminModerationReview } from "../admin-resources/data-source";
import { DecisionActions } from "./decision-actions";
import { HOLD_LABELS, REVIEW_STATUS_LABELS, holdTone, statusTone } from "./labels";
import styles from "./review-detail.module.css";

type DetailParams = Promise<{ id: string }>;

const CONTENT_FIELDS = [
  ["display_name", "角色名"],
  ["intro", "简介"],
  ["opening_scene", "开场"],
  ["character_settings", "人设"],
  ["example_dialogues", "示例对话"],
  ["response_rules", "回复规则"],
] as const;

function value(label: string, content: React.ReactNode) {
  return <div className={styles.value}><dt>{label}</dt><dd>{content ?? "--"}</dd></div>;
}

function badge(label: string, tone: "good" | "warn" | "bad" | "muted" = "muted") {
  return <span className={`${styles.badge} ${styles[tone]}`}>{label}</span>;
}

/**
 * 决定写按钮是否可用。写路径要同时满足远端数据源与写开关；fixture 模式下后台代理没有
 * 后端可打，与其让运营点完拿 503，不如直接说明原因。
 */
function writeAvailability(): { canWrite: boolean; reason: string } {
  if (adminDataSourceMode() !== "remote") {
    return { canWrite: false, reason: "当前是 fixture 数据源，处置动作不可用。" };
  }
  if (!adminApiWritesEnabled()) {
    return { canWrite: false, reason: "Admin API 写入未启用（ADMIN_API_WRITE_ENABLED），处置动作不可用。" };
  }
  return { canWrite: true, reason: "" };
}

export async function ModerationReviewDetailPage({ params }: { params: DetailParams }) {
  const { id } = await params;
  let loaded;
  try {
    loaded = await getAdminModerationReview(id, "plum_admin_moderation_console");
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    if (error instanceof AdminApiError) {
      return <div className={styles.error}><strong>{error.status} · 数据加载失败</strong><span>{error.message}</span></div>;
    }
    throw error;
  }
  const review = loaded.data;
  const { canWrite, reason } = writeAvailability();
  const purged = review.status === "purged";

  return (
    <article className={styles.page}>
      <Link className={styles.back} href="/moderation"><ArrowLeft size={15} />返回复核队列</Link>
      <header className={styles.header}>
        <div>
          <span>MODERATION REVIEW</span>
          <h1>{review.display_name || "(无名称)"}</h1>
          <code>{review.id}</code>
        </div>
        <div className={styles.headerStatus}>
          {badge(REVIEW_STATUS_LABELS[review.status], statusTone(review.status))}
          {badge(review.visibility, review.visibility === "public" ? "good" : "muted")}
          {review.moderation_hold !== "none" && badge(HOLD_LABELS[review.moderation_hold], holdTone(review.moderation_hold))}
        </div>
      </header>

      <section className={styles.band} aria-labelledby="review-governance">
        <h2 id="review-governance">复核信息</h2>
        <dl className={styles.valueGrid}>
          {value("Character", <Link href={`/characters/${encodeURIComponent(review.character_id)}`}>{review.character_id}<ExternalLink size={12} /></Link>)}
          {value("Work", <Link href={`/works/${encodeURIComponent(review.work_id)}`}>{review.work_id}<ExternalLink size={12} /></Link>)}
          {value("送审版本", `v${review.version_number}`)}
          {value("创作者", review.owner_platform_user_id)}
          {value("触发来源", review.trigger_source)}
          {value("风险等级", review.risk_level || "--")}
          {value("Character 状态", review.character_status)}
          {value("入队时间", formatDateTime(review.created_at))}
          {value("更新时间", formatDateTime(review.updated_at))}
          {value("认领人", review.assigned_admin_open_id ?? "--")}
          {value("处置人", review.decided_by_open_id ?? "--")}
          {value("处置时间", formatDateTime(review.decided_at ?? null))}
          {value("原因码", review.reason_code ?? "--")}
          {value("备注", review.note ?? "--")}
        </dl>
      </section>

      <section className={styles.band} aria-labelledby="review-labels">
        <h2 id="review-labels">机审标签</h2>
        <div className={styles.labels}>
          {review.machine_labels.length
            ? review.machine_labels.map((label) => <span key={label} className={styles.label}>{label}</span>)
            : <span className={styles.none}>机审未给出标签</span>}
        </div>
      </section>

      <section className={styles.band} aria-labelledby="review-content">
        <h2 id="review-content">送审正文</h2>
        <div className={styles.contentColumn}>
          <p className={styles.plaintextNotice}>
            <Eye size={14} />
            这次读取已按明文访问记入审计（<code>admin_access_events</code>）。
          </p>
          {purged ? (
            <p className={styles.purged}>该内容已被下架处置，服务端不再保留正文。以下字段为空是预期结果。</p>
          ) : null}
          <dl className={styles.contentGrid}>
            {CONTENT_FIELDS.map(([field, label]) => (
              <div key={field} className={styles.contentField}>
                <dt>{label}</dt>
                <dd>{review.content[field] ? <pre>{review.content[field]}</pre> : <span className={styles.none}>--</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="review-decision">
        <h2 id="review-decision">处置</h2>
        <DecisionActions
          reviewId={review.id}
          status={review.status}
          assignedTo={review.assigned_admin_open_id ?? null}
          canWrite={canWrite}
          writeBlockedReason={reason}
        />
      </section>
    </article>
  );
}

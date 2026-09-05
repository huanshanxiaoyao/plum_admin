import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminApiError } from "../../lib/bff/client";
import { getCurrentIdentity } from "../../lib/auth/session";
import { canUseImports } from "./access";
import { BatchTable } from "./batch-table";
import { listImportBatches, type ImportBatchPage } from "./data-source";
import { BATCHES_PER_PAGE, historyHref, normalizeOffset } from "./history-paging";
import styles from "./imports.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

export type ImportHistoryPageProps = { searchParams: Promise<SearchParams> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function ImportHistoryPage({ searchParams }: ImportHistoryPageProps) {
  const identity = await getCurrentIdentity();
  if (!identity || !canUseImports(identity.capabilities)) notFound();

  const offset = normalizeOffset(first((await searchParams).offset));

  let page: ImportBatchPage | undefined;
  let loadError: AdminApiError | undefined;
  try {
    page = await listImportBatches(offset);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    loadError = error;
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <Link className={styles.back} href="/imports">
            <ArrowLeft size={14} />
            角色导入
          </Link>
          <h1>导入历史</h1>
          <p>按时间倒序的批次台账。点开任意一批可以回到它的逐行结果并重新导出清单。</p>
        </div>
      </header>

      {/* 台账是唯一的事后补救入口，所以「没有回滚」必须写在这一页，而不是只写在提交前。 */}
      <p className={styles.specNote}>
        <strong>导入不提供批次回滚。</strong>
        写错了只能再导一次覆盖：把结果清单里的 <code>character_id</code> 贴回源包，改好后重新导入。
        已发布的角色可以在<Link href="/moderation">内容复核</Link>单独下架。
      </p>

      <BatchTable
        batches={page?.batches ?? []}
        error={loadError}
        label="导入批次台账"
        emptyHint="第一次导入完成后，批次会出现在这里"
      />

      <footer className={styles.pagination}>
        <span>
          第 {offset + 1} – {offset + (page?.batches.length ?? 0)} 条
        </span>
        {offset > 0 ? (
          <Link href={historyHref(offset - BATCHES_PER_PAGE)} aria-label="上一页" title="上一页">
            <ChevronLeft size={16} />
          </Link>
        ) : (
          <button type="button" disabled aria-label="上一页">
            <ChevronLeft size={16} />
          </button>
        )}
        {page?.hasMore ? (
          <Link href={historyHref(offset + BATCHES_PER_PAGE)} aria-label="下一页" title="下一页">
            <ChevronRight size={16} />
          </Link>
        ) : (
          <button type="button" disabled aria-label="下一页">
            <ChevronRight size={16} />
          </button>
        )}
      </footer>
    </div>
  );
}

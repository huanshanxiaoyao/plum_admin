import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AdminApiError } from "../../lib/bff/client";
import { BatchTable } from "./batch-table";
import type { ImportBatch } from "./import-contracts";
import { listImportBatches } from "./data-source";
import styles from "./imports.module.css";

/** 导入台上只放最近几批做"跑完还能找回来"的锚点，全量在 /imports/batches。 */
const RECENT_LIMIT = 5;

/**
 * 台账加载失败不能连累导入台。这一段被包在 `<Suspense>` 里单独流式渲染，
 * 且自己吞掉 `AdminApiError`——后端台账挂了，运营照样能打包、预检、提交。
 */
export async function RecentBatches() {
  let batches: readonly ImportBatch[] = [];
  let loadError: AdminApiError | undefined;
  try {
    batches = (await listImportBatches(0, RECENT_LIMIT)).batches;
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    loadError = error;
  }

  return (
    <section className={styles.recent} aria-label="最近导入">
      <div className={styles.recentHeader}>
        <h2>最近导入</h2>
        <Link className={styles.recentMore} href="/imports/batches">
          全部批次
          <ChevronRight size={13} />
        </Link>
      </div>
      <BatchTable
        batches={batches}
        error={loadError}
        label="最近导入批次"
        emptyHint="第一次导入完成后，批次会出现在这里"
      />
    </section>
  );
}

export function RecentBatchesFallback() {
  return (
    <section className={styles.recent} aria-label="最近导入">
      <div className={styles.recentHeader}>
        <h2>最近导入</h2>
      </div>
      <p className={styles.hint}>正在读取批次台账…</p>
    </section>
  );
}

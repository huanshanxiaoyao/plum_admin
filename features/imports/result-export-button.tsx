"use client";

import { Download } from "lucide-react";
import type { ImportBatchDetail } from "./import-contracts";
import { buildResultManifest, resultManifestFilename } from "./result-export";
import styles from "./imports.module.css";

/**
 * 结果清单在浏览器里由已经渲染出来的数据拼装，不走服务端端点。
 *
 * 这除了省一个接口，还有个结构性好处：**导出内容与页面上看到的是同一份数据**，
 * 不存在「页面上看不到但导出里有」的可能。正文从来没有进过这份数据。
 */
export function ResultExport({ detail }: { detail: ImportBatchDetail }) {
  function download() {
    const blob = new Blob([buildResultManifest(detail.rows, detail.batch.owner_platform_user_id)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = resultManifestFilename(detail.batch);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className={styles.secondaryAction} onClick={download}>
      <Download size={15} />
      导出结果清单
    </button>
  );
}

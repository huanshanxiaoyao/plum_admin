"use client";

import { Download } from "lucide-react";
import { TEMPLATE_FILENAME, buildManifestTemplate } from "./template";
import styles from "./imports.module.css";

/**
 * 模板在浏览器里生成，不走后端：字段定义已经在 `manifest-schema.ts` 里，多一个接口
 * 只会多一处需要跟着改的地方。
 */
export function TemplateDownload() {
  function download() {
    const blob = new Blob([buildManifestTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = TEMPLATE_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className={styles.secondaryAction} onClick={download}>
      <Download size={15} />
      下载 CSV 模板
    </button>
  );
}

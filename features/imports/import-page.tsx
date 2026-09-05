import { AlertTriangle, FileSpreadsheet, Image as ImageIcon, Package } from "lucide-react";
import { notFound } from "next/navigation";
import { getCurrentIdentity } from "../../lib/auth/session";
import {
  IMPORT_CAPABILITY,
  canUseImports,
  importWriteAvailability,
  serverPreflightAvailable,
} from "./access";
import { ImportConsole } from "./import-console";
import {
  MANIFEST_FIELDS,
  MAX_IMAGE_BYTES,
  MAX_PACKAGE_BYTES,
  MAX_ROWS_PER_PACKAGE,
  MAX_TAGS_PER_CHARACTER,
} from "./manifest-schema";
import { TemplateDownload } from "./template-download";
import styles from "./imports.module.css";

const STEPS = [
  { title: "准备包", detail: "一张 CSV 表格加一个 images 文件夹，压成 zip" },
  { title: "上传", detail: "浏览器本地解包，图片不经过后台服务器" },
  { title: "预检", detail: "逐行校验，不写入任何数据，可反复重传" },
  { title: "确认", detail: "核对归属账号，填写导入原因" },
  { title: "结果", detail: "逐行终态，导出结果清单供下次更新使用" },
] as const;

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export async function ImportConsolePage() {
  const identity = await getCurrentIdentity();
  // 布局层已经挡掉了未登录，这里再挡一次能力：直接敲 /imports 不应该绕过导航的可见性。
  if (!identity || !canUseImports(identity.capabilities)) notFound();

  const { canWrite, blockedReason } = importWriteAvailability();
  const requiredColumns = MANIFEST_FIELDS.filter((field) => field.columnRequired);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span>IMPORT</span>
          <h1>角色导入</h1>
          <p>用一个压缩包成批新建或更新角色。与创作者自建走完全相同的审核与发布链路。</p>
        </div>
        <div className={styles.headerActions}>
          <TemplateDownload />
        </div>
      </header>

      {!canWrite && (
        <p className={styles.blocked} role="status">
          <AlertTriangle size={14} />
          {blockedReason}
        </p>
      )}

      <ol className={styles.steps} aria-label="导入流程">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className={styles.stepIndex}>{index + 1}</span>
            <strong>{step.title}</strong>
            <small>{step.detail}</small>
          </li>
        ))}
      </ol>

      <ImportConsole
        canSubmit={canWrite}
        submitBlockedReason={blockedReason}
        serverPreflight={serverPreflightAvailable()}
      />

      <section className={styles.spec} aria-label="打包要点">
        <h2>打包要点</h2>
        <div className={styles.specGrid}>
          <article>
            <h3>
              <Package size={14} />
              包结构
            </h3>
            <ul>
              <li>顶层只放 <code>manifest.csv</code> 与 <code>images/</code></li>
              <li>不接受 <code>.xlsx</code>，请另存为 CSV UTF-8</li>
              <li>文件名用英文和数字，避免跨平台乱码</li>
            </ul>
          </article>
          <article>
            <h3>
              <FileSpreadsheet size={14} />
              表格
            </h3>
            <ul>
              <li>必填列 {requiredColumns.length} 个：{requiredColumns.map((field) => field.name).join("、")}</li>
              <li><code>character_id</code> 留空为新建，填写为更新</li>
              <li>标签最多 {MAX_TAGS_PER_CHARACTER} 个，竖线分隔</li>
            </ul>
          </article>
          <article>
            <h3>
              <ImageIcon size={14} />
              图片与规模
            </h3>
            <ul>
              <li>jpg / png / webp，单张不超过 {megabytes(MAX_IMAGE_BYTES)}</li>
              <li>推荐 1080 × 1920（9:16）</li>
              <li>单包最多 {MAX_ROWS_PER_PACKAGE} 个角色 / {megabytes(MAX_PACKAGE_BYTES)}</li>
            </ul>
          </article>
        </div>
        <p className={styles.specNote}>
          更新是<strong>整行覆盖</strong>：可选列留空表示清空该字段，不是保持原样。因此每次导入后请保留源包，
          下次在源包上改并补上 <code>character_id</code> 列。
        </p>
      </section>

      <footer className={styles.footnote}>
        当前权限：{IMPORT_CAPABILITY} · {identity.displayName}
      </footer>
    </div>
  );
}

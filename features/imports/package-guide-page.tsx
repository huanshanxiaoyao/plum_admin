import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileArchive, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { getCurrentIdentity } from "../../lib/auth/session";
import { canUseImports } from "./access";
import {
  MANIFEST_FIELDS,
  MAX_IMAGE_BYTES,
  MAX_PACKAGE_BYTES,
  MAX_ROWS_PER_PACKAGE,
  MAX_TAGS_PER_CHARACTER,
  type ManifestField,
} from "./manifest-schema";
import { TemplateDownload } from "./template-download";
import styles from "./imports.module.css";

const FIELD_NOTES: Readonly<Record<string, string>> = {
  row_key: "包内唯一的稳定行标识。建议使用编号加英文短名，例如 001_luna。",
  display_name: "对用户展示的角色名称。",
  gender: "角色性别，只接受约定枚举。",
  intro: "角色简介。最终是否超限以服务端预检的容量条为准。",
  opening_scene: "开场场景。CSV 内含换行时，整个字段必须使用双引号包裹。",
  character_settings: "角色设定正文，与 response_rules 共享服务端容量预算。",
  creator_declared_rating: "运营声明的内容评级；平台审核可以上调实际评级。",
  portrait_file: "包内图片相对路径。新建必填；更新留空表示沿用现有立绘。",
  owner_platform_user_id: "行级归属账号。列省略或值留空时使用页面选择的批次默认账号。",
  character_id: "留空表示新建；填写已有 ID 表示更新。Excel 中必须把该列设为文本。",
  example_dialogues: "示例对话；更新时留空会清空现有内容。",
  response_rules: "回复规则；更新时留空会清空现有内容。",
  tag_ids: `标签 ID 使用竖线分隔，最多 ${MAX_TAGS_PER_CHARACTER} 个且不可重复。`,
  visibility: "public 或 private；留空使用 private。",
  portrait_crop: "归一化的 x,y,width,height；留空时居中裁成 9:16。",
  avatar_crop: "归一化的 x,y,width,height；留空时居中裁成 1:1。",
  note: "仅保留在导入结果中，不写入角色数据。",
};

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function requirement(field: ManifestField): string {
  if (field.name === "portrait_file") return "条件必填";
  if (field.valueRequired) return "每行必填";
  if (field.columnRequired) return "列必需";
  return "可选";
}

function acceptedValues(field: ManifestField): string {
  if (field.enumValues) return field.enumValues.join(" / ");
  if (field.name === "tag_ids") return `最多 ${MAX_TAGS_PER_CHARACTER} 个`;
  if (field.name === "portrait_crop" || field.name === "avatar_crop") return "0-1 归一化坐标";
  if (field.maxLength) return `最多 ${field.maxLength.toLocaleString("zh-CN")} 字符`;
  return "文本";
}

export async function ImportPackageGuidePage() {
  const identity = await getCurrentIdentity();
  if (!identity || !canUseImports(identity.capabilities)) notFound();

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <Link aria-label="返回角色导入" className={styles.back} href="/imports">
            <ArrowLeft size={14} />
            角色导入
          </Link>
          <h1>角色导入打包规范</h1>
          <p>制作 ZIP、填写 manifest 和准备立绘时遵循的完整格式要求。</p>
        </div>
        <div className={styles.headerActions}>
          <TemplateDownload />
        </div>
      </header>

      <nav className={styles.guideJumps} aria-label="打包规范目录">
        <a href="#package-structure">包结构</a>
        <a href="#manifest-fields">字段说明</a>
        <a href="#images">图片要求</a>
        <a href="#package-checklist">打包检查</a>
      </nav>

      <article className={styles.guide}>
        <section id="package-structure" aria-labelledby="package-structure-title">
          <div className={styles.guideSectionHeading}>
            <FileArchive size={17} />
            <div>
              <span>01</span>
              <h2 id="package-structure-title">包结构</h2>
            </div>
          </div>
          <p>ZIP 顶层只能放一个 manifest 和一个 images 目录，不要把它们再套进同名文件夹。</p>
          <pre className={styles.guideCode}>{`plum_characters_20260905_v1.zip
|-- manifest.csv
\`-- images/
    |-- 001_luna.png
    \`-- 002_kai.jpg`}</pre>
          <ul>
            <li><code>manifest.csv</code> 与 <code>manifest.jsonl</code> 二选一，日常操作推荐 CSV。</li>
            <li>不接受 Excel 文件。编辑完成后另存为“CSV UTF-8（逗号分隔）”。</li>
            <li>文件名使用 ASCII 字母、数字、短横线或下划线，避免跨平台乱码。</li>
            <li>不接受加密 ZIP、符号链接、绝对路径和包含 <code>..</code> 的路径。</li>
          </ul>
        </section>

        <section id="manifest-fields" aria-labelledby="manifest-fields-title">
          <div className={styles.guideSectionHeading}>
            <FileSpreadsheet size={17} />
            <div>
              <span>02</span>
              <h2 id="manifest-fields-title">manifest 字段</h2>
            </div>
          </div>
          <p>
            从本页下载模板后修改示例行。不要在 CSV 中添加说明行；每一行都会被当作角色数据解析。
          </p>
          <div className={styles.guideTableWrap}>
            <table className={styles.guideTable}>
              <thead>
                <tr>
                  <th>字段</th>
                  <th>要求</th>
                  <th>取值或上限</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {MANIFEST_FIELDS.map((field) => (
                  <tr key={field.name}>
                    <td><code>{field.name}</code></td>
                    <td>{requirement(field)}</td>
                    <td>{acceptedValues(field)}</td>
                    <td>{FIELD_NOTES[field.name]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.guideCallout}>
            <AlertTriangle size={16} />
            <p>
              <strong>更新是全量覆盖。</strong>除立绘和归属账号的特殊规则外，可选字段留空会清空原值，
              不是“保持不变”。必须从上一次保留的源包修改。
            </p>
          </div>
          <ul>
            <li>长文本中的换行必须由双引号包住；字段内的双引号写成两个双引号。</li>
            <li><code>character_id</code> 决定新建或更新。更新时预检会回显目标角色当前名称。</li>
            <li>不允许添加状态、审核、热度、发布时间等系统字段；预检会拒绝未知列。</li>
            <li>字符数只是第一道限制，最终以服务端预检显示的各文本块容量为准。</li>
          </ul>
        </section>

        <section id="images" aria-labelledby="images-title">
          <div className={styles.guideSectionHeading}>
            <ImageIcon size={17} />
            <div>
              <span>03</span>
              <h2 id="images-title">图片与批次限制</h2>
            </div>
          </div>
          <div className={styles.guideColumns}>
            <div>
              <h3>立绘</h3>
              <ul>
                <li>支持 JPEG、PNG、WebP，扩展名必须与真实格式一致。</li>
                <li>单张不超过 {megabytes(MAX_IMAGE_BYTES)}，总像素不超过 6,000 万。</li>
                <li>推荐原图 1080 x 1920（9:16）。</li>
                <li>裁剪后立绘至少 360 x 640，头像至少 192 x 192。</li>
              </ul>
            </div>
            <div>
              <h3>整包</h3>
              <ul>
                <li>最多 {MAX_ROWS_PER_PACKAGE} 个角色。</li>
                <li>ZIP 不超过 {megabytes(MAX_PACKAGE_BYTES)}。</li>
                <li>全后台同时只能执行一个导入批次。</li>
                <li>预检表只显示前 60 行的缩略图，第 61 行起显示文件名。</li>
              </ul>
            </div>
          </div>
          <p>
            同一张原图会生成 9:16 立绘和 1:1 头像。非 9:16 原图默认居中裁剪，可能切掉人物头部；
            请优先提供 9:16 原图，必要时填写裁剪参数。
          </p>
        </section>

        <section id="package-checklist" aria-labelledby="package-checklist-title">
          <div className={styles.guideSectionHeading}>
            <FileArchive size={17} />
            <div>
              <span>04</span>
              <h2 id="package-checklist-title">压缩前检查</h2>
            </div>
          </div>
          <ol>
            <li>确认 CSV 是 UTF-8，列名与模板完全一致，没有说明行和空的角色行。</li>
            <li>确认每个 <code>row_key</code> 唯一，图片路径与 ZIP 内文件逐字一致。</li>
            <li>确认更新行的 <code>character_id</code> 完整，并已按文本格式保存。</li>
            <li>确认内容评级、授权来源和目标归属账号正确。</li>
            <li>直接压缩 manifest 与 images 目录，避免额外的顶层文件夹。</li>
          </ol>
          <p className={styles.guideNext}>
            包准备好后，返回<Link href="/imports">角色导入</Link>上传。第一次操作建议同时打开
            <Link href="/imports/user-guide">详细使用说明</Link>逐步核对。
          </p>
        </section>
      </article>
    </div>
  );
}

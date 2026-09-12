import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  History,
  SearchCheck,
  Upload,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getCurrentIdentity } from "../../lib/auth/session";
import { canUseImports } from "./access";
import styles from "./imports.module.css";

const RESULTS = [
  ["已发布", "角色已经上线。打开角色 ID 链接，核对名称、归属账号、立绘和本次更新内容。"],
  ["待复核", "角色存在已有人工扣留，或这是历史待复核结果。需到内容复核完成处置，重复导入不会自动放行。"],
  ["被拒", "内容被审核终拒。根据公开的拒绝类别修改源包，重新打包后作为新批次提交。"],
  ["失败", "格式、版本冲突或外部依赖异常。按行内提示处理，不要直接重复点击提交。"],
] as const;

export async function ImportUserGuidePage() {
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
          <h1>角色导入使用说明</h1>
          <p>从上传前确认到导入后处置的完整操作流程。</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryAction} href="/imports/package-guide">
            查看打包规范
          </Link>
        </div>
      </header>

      <div className={styles.guideCallout}>
        <AlertTriangle size={16} />
        <p>
          <strong>生产导入会真实创建或更新角色，且没有批次回滚。</strong>
          更新写错时只能修正源包后再导入覆盖；内容复核中的 purge 不可撤销。
        </p>
      </div>

      <nav className={styles.guideJumps} aria-label="使用说明目录">
        <a href="#before-upload">上传前</a>
        <a href="#upload">上传与预检</a>
        <a href="#submit">确认与提交</a>
        <a href="#after-import">结果与后续</a>
      </nav>

      <article className={styles.guide}>
        <section id="before-upload" aria-labelledby="before-upload-title">
          <div className={styles.guideSectionHeading}>
            <ClipboardCheck size={17} />
            <div>
              <span>01</span>
              <h2 id="before-upload-title">上传前确认</h2>
            </div>
          </div>
          <ol>
            <li>使用<Link href="/imports/package-guide">打包规范</Link>中的模板准备 ZIP。</li>
            <li>确认本批的归属账号。更新已有角色时不能改变原归属账号。</li>
            <li>确认所有内容和图片拥有可发布授权，并完成 general / mature 评级判断。</li>
            <li>更新已有人工扣留的角色时，和复核同事确认处置；导入不能解除人工扣留。</li>
            <li>确认没有其他人正在导入。全后台同一时间只允许一个执行中的批次。</li>
          </ol>
        </section>

        <section id="upload" aria-labelledby="upload-title">
          <div className={styles.guideSectionHeading}>
            <Upload size={17} />
            <div>
              <span>02</span>
              <h2 id="upload-title">选择 ZIP 并完成预检</h2>
            </div>
          </div>
          <ol>
            <li>在角色导入页选择或拖入 ZIP。浏览器在本地解包，选择文件本身不会写入生产数据。</li>
            <li>等待本地校验和服务端预检完成。服务端预检也是只读的，可以修改后反复重传。</li>
            <li>逐行核对角色名、新建/更新标记、目标角色当前名称、容量条和问题列表。</li>
            <li>核对立绘与行的对应关系。前 60 行显示缩略图，第 61 行起需按文件名核对。</li>
            <li>有错误的行不会提交。修正源文件、重新压缩并上传，直到准备提交的行全部符合预期。</li>
          </ol>
          <div className={styles.guideCalloutNeutral}>
            <SearchCheck size={16} />
            <p>预检通过只代表格式、容量和目标关系正确；正式提交仍可能被机审明确拒绝。</p>
          </div>
        </section>

        <section id="submit" aria-labelledby="submit-title">
          <div className={styles.guideSectionHeading}>
            <CheckCircle2 size={17} />
            <div>
              <span>03</span>
              <h2 id="submit-title">确认并提交</h2>
            </div>
          </div>
          <ol>
            <li>选择批次默认归属账号，并核对页面回显的公开名称和平台用户 ID。</li>
            <li>填写可追溯的导入原因，例如日期、内容项目和批次编号。</li>
            <li>勾选内容权利和分级声明。声明会与操作人、批次 ID 一起进入审计账本。</li>
            <li>点击提交后保持页面打开，等待图片上传和逐行处理结束，不要重复点击。</li>
            <li>只有预检通过的行会参与本批；一行失败不会回滚其他已成功的行。</li>
          </ol>
          <p>
            图片从浏览器直接上传到对象存储，再由后端逐行创建草稿、执行审核并发布或进入复核。
            后台导入中的文案和图片机审待复核直接放行，明确拒绝仍拦截；机审未给出分级时按 mature 发布。
            此策略不解除已有人工扣留或拒绝，也不自动处理历史待复核记录。
            同一个包重新上传会得到同一个批次标识；修改内容后重新打包才是新批次。
          </p>
        </section>

        <section id="after-import" aria-labelledby="after-import-title">
          <div className={styles.guideSectionHeading}>
            <History size={17} />
            <div>
              <span>04</span>
              <h2 id="after-import-title">理解结果并完成后续</h2>
            </div>
          </div>
          <div className={styles.guideResultList}>
            {RESULTS.map(([title, detail]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{detail}</p>
              </div>
            ))}
          </div>
          <ol>
            <li>打开成功角色的详情页，抽查本批新增和更新内容。</li>
            <li>若有待复核行，进入<Link href="/moderation">内容复核</Link>完成 release、confine 或 purge。</li>
            <li>导出结果清单，把新生成的 <code>character_id</code> 按 <code>row_key</code> 回填到源包。</li>
            <li>保留源 ZIP 和结果清单。系统不会导出角色正文，源包是后续修订的唯一正文副本。</li>
            <li>从<Link href="/imports/batches">导入历史</Link>可再次打开结果页，但不能撤销整批导入。</li>
            <li>Admin 可在<Link href="/audit">操作审计</Link>按导入动作核对操作人、时间和批次 ID。</li>
          </ol>
          <p className={styles.guideNext}>
            准备完成后返回<Link href="/imports">角色导入</Link>开始操作。遇到版本冲突、依赖异常或结果计数不一致时，
            先停止重试并保留批次 ID，再联系研发排查。
          </p>
        </section>
      </article>
    </div>
  );
}

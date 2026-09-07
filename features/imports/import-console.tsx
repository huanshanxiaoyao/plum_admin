"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { MAX_ROWS_PER_PACKAGE } from "./manifest-schema";
import { parseCrop } from "./local-validation";
import { readPackage, type ReadPackageResult } from "./package-reader";
import { buildReviewModel, submittableRows, type ReviewModel } from "./review-model";
import { PreflightTable } from "./preflight-table";
import { usePortraitPreviews } from "./portrait-previews";
import { OwnerPicker, type OwnerAccount } from "./owner-picker";
import { ImportApiError, createUploadTransport, requestPreflight, submitImport } from "./import-api";
import {
  failedUploads,
  runUploads,
  succeededPortraits,
  type UploadFailure,
  type UploadProgress,
  type UploadedPortrait,
} from "./upload-orchestrator";
import type {
  ImportBatchDetail,
  ImportRowPayload,
  PreflightRequest,
  ImportExecuteRequest,
  PreflightRow,
} from "./import-contracts";
import { batchCounts, toBatchDetail } from "./import-contracts";
import styles from "./imports.module.css";

type Stage = "idle" | "reading" | "reviewed" | "submitting" | "done";

type Props = {
  readonly canSubmit: boolean;
  readonly submitBlockedReason: string;
  readonly serverPreflight: boolean;
};

/** 包内容哈希派生的批次号：重传同一个包会命中幂等重放，不会二次创建。 */
async function deriveBatchId(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * 提交给接口的一行。
 *
 * `AdminImportRow` 是 `additionalProperties: false`——多带一个 `portrait_file`
 * （那是包内的本地概念）或 `operation`（服务端自己按 character_id 判定）就是 422，
 * 而且要等运营点完提交才会知道。
 *
 * 放宽成 `Partial` 是刻意的：openapi-typescript 把带默认值的字段标成必填，但请求里
 * 它们可省。立绘构图（position / zoom）不在打包表里，显式发一遍默认值会把更新行上
 * 已有的构图覆盖掉。列名和类型仍然受契约约束，写错一个字段名照样报错。
 */
type RowPayload = Partial<ImportRowPayload> & Pick<ImportRowPayload, "row_key">;

type PreflightBody = Omit<PreflightRequest, "rows"> & { readonly rows: readonly RowPayload[] };
type ExecuteBody = Omit<ImportExecuteRequest, "rows"> & { readonly rows: readonly RowPayload[] };

function rowPayload(values: Readonly<Record<string, string>>): RowPayload {
  const tags = (values.tag_ids ?? "").trim();
  const visibility = (values.visibility ?? "").trim();
  return {
    row_key: (values.row_key ?? "").trim(),
    // 契约里这些都是空串兜底的字符串，不是可空字段。
    character_id: (values.character_id ?? "").trim(),
    owner_platform_user_id: (values.owner_platform_user_id ?? "").trim(),
    display_name: values.display_name ?? "",
    gender: values.gender ?? "",
    intro: values.intro ?? "",
    opening_scene: values.opening_scene ?? "",
    character_settings: values.character_settings ?? "",
    example_dialogues: values.example_dialogues ?? "",
    response_rules: values.response_rules ?? "",
    tag_ids: tags ? tags.split("|").map((tag) => tag.trim()) : [],
    creator_declared_rating: values.creator_declared_rating ?? "",
    // 留空就不发，可见性的默认值由服务端定（契约是 private）。
    ...(visibility ? { visibility } : {}),
  };
}

export function ImportConsole({ canSubmit, submitBlockedReason, serverPreflight }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [batchId, setBatchId] = useState("");
  const [read, setRead] = useState<ReadPackageResult | null>(null);
  const [model, setModel] = useState<ReviewModel | null>(null);
  const [serverChecked, setServerChecked] = useState(false);
  const [owner, setOwner] = useState<OwnerAccount | null>(null);
  const [reason, setReason] = useState("");
  const [declared, setDeclared] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  // 上一次提交里立绘没传上去的行。留到下一次提交前才清，运营才有机会看清楚原因。
  const [uploadFailures, setUploadFailures] = useState<ReadonlyMap<string, UploadFailure>>(
    () => new Map(),
  );
  const [batch, setBatch] = useState<ImportBatchDetail | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const portraits = usePortraitPreviews(read);
  // 已传成功的立绘留在这里，重试时跳过——运营不该为一次网络抖动重传所有图片。
  const uploaded = useRef(new Map<string, UploadedPortrait>());

  const reset = useCallback(() => {
    setStage("idle");
    setFileName("");
    setBatchId("");
    setRead(null);
    setModel(null);
    setServerChecked(false);
    setProgress(null);
    setUploadFailures(new Map());
    setBatch(null);
    setError("");
    uploaded.current = new Map();
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setStage("reading");
      setError("");
      setBatch(null);
      setProgress(null);
      setUploadFailures(new Map());
      setServerChecked(false);
      uploaded.current = new Map();
      setFileName(file.name);

      try {
        const [result, id] = await Promise.all([readPackage(file), deriveBatchId(file)]);
        setRead(result);
        setBatchId(id);

        let preflight: readonly PreflightRow[] | null = null;
        const localModel = buildReviewModel(result, null, owner?.platformUserId ?? null);
        // 包结构就不对时不打扰服务端：预检解决不了"少了 manifest"这类问题。
        // 归属账号是契约上的必填项，没选之前无从预检——选完会重跑这个回调。
        if (serverPreflight && owner && !localModel.packageBlocked && result.rows.length > 0) {
          try {
            const body: PreflightBody = {
              batch_id: id,
              default_owner_platform_user_id: owner.platformUserId,
              rows: result.rows.map((row) => rowPayload(row.values)),
            };
            const response = await requestPreflight(body);
            // 契约里预检结果就是 data 本身，不是 data.rows。
            preflight = response.data;
            setServerChecked(true);
          } catch (caught) {
            setError(
              caught instanceof ImportApiError
                ? `服务端预检失败：${caught.message}`
                : "服务端预检失败，以下只是本地校验结果。",
            );
          }
        }
        setModel(buildReviewModel(result, preflight, owner?.platformUserId ?? null));
        setStage("reviewed");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "读取压缩包失败。");
        setStage("idle");
      }
    },
    [owner, serverPreflight],
  );

  async function submit() {
    if (!read?.archive || !model || !owner) return;
    // 两项声明是契约上的字面量 true，没勾就不该走到这里。
    if (!declared || reason.trim().length === 0) return;
    const rows = submittableRows(model);
    if (rows.length === 0) return;

    setStage("submitting");
    setError("");
    setUploadFailures(new Map());
    try {
      const byRowKey = new Map(
        read.rows.map((row) => [(row.values.row_key ?? "").trim(), row.values]),
      );
      const crops = new Map(
        rows.map((row) => {
          const values = byRowKey.get(row.rowKey) ?? {};
          return [
            row.rowKey,
            {
              portrait: parseCrop((values.portrait_crop ?? "").trim()) ?? undefined,
              avatar: parseCrop((values.avatar_crop ?? "").trim()) ?? undefined,
            },
          ];
        }),
      );

      const tasks = rows
        .filter((row) => row.portraitPath && read.images.has(row.portraitPath))
        .map((row) => ({ rowKey: row.rowKey, image: read.images.get(row.portraitPath!)! }));

      const outcomes = await runUploads(
        tasks,
        createUploadTransport(read.archive, {
          ownerPlatformUserId: owner.platformUserId,
          crops,
        }),
        { done: uploaded.current, onProgress: setProgress },
      );
      uploaded.current = new Map(succeededPortraits(outcomes));

      const failures = failedUploads(outcomes);
      setUploadFailures(failures);

      // 立绘没传上去的行不提交：带着空立绘发布出去的角色比失败更难收拾。
      const submitting = rows.filter((row) => !failures.has(row.rowKey));
      // 一行都不剩时不要发空 rows：那必然被契约挡回一个 422，运营看到的是"导入提交失败"
      // 这种与真正原因无关的话。原因已经逐行落在表里了，这里只要把人指过去。
      if (submitting.length === 0) {
        setError(
          `${failures.size} 行的立绘全部上传失败，没有可提交的行。逐行原因见上方表格的「校验」列；` +
            `修好后可以直接再点提交，已经传上去的立绘不会重传。`,
        );
        setStage("reviewed");
        return;
      }

      const body: ExecuteBody = {
        batch_id: batchId,
        default_owner_platform_user_id: owner.platformUserId,
        reason: reason.trim(),
        confirmations: { adult_confirmed: true, rights_confirmed: true },
        rows: submitting.map((row) => {
          const portrait = uploaded.current.get(row.rowKey);
          const values = byRowKey.get(row.rowKey) ?? {};
          return {
            ...rowPayload(values),
            // operation 不发：服务端按 character_id 自己判定，多发一个字段是 422。
            expected_revision: row.server?.expected_revision ?? null,
            ...(portrait
              ? { portrait_media_id: portrait.mediaId, image_set_id: portrait.imageSetId }
              : {}),
          };
        }),
      };
      const response = await submitImport(body);
      setBatch(toBatchDetail(response));
      setStage("done");
    } catch (caught) {
      setError(
        caught instanceof ImportApiError ? caught.message : "导入提交失败，请稍后重试。",
      );
      setStage("reviewed");
    }
  }

  const rows = model ? submittableRows(model) : [];
  const readyToSubmit =
    canSubmit && !!owner && reason.trim().length > 0 && declared && rows.length > 0;

  if (stage === "done" && batch) {
    const counts = batchCounts(batch.batch);
    return (
      <section className={styles.doneCard} aria-label="导入完成">
        <CheckCircle2 size={26} />
        <strong>导入完成</strong>
        <p>
          已发布 {counts.published} · 待复核 {counts.pending_review} · 被拒{" "}
          {counts.rejected} · 失败 {counts.failed}
        </p>
        {/*
          部分行的立绘没传上去时，这些行压根没进这一批，上面的计数里不会出现它们。
          完成态又把预检表整个换掉了，不在这儿说一句，这些行就静悄悄地消失了。
        */}
        {uploadFailures.size > 0 && (
          <p className={styles.doneWarning} role="alert">
            <AlertTriangle size={14} />
            另有 {uploadFailures.size} 行因立绘上传失败未提交，不在以上计数内。重新选择同一个包再导
            一次即可——批次号由包内容决定，已经导入的行会命中幂等重放，不会重复创建。
          </p>
        )}
        <div className={styles.doneActions}>
          <Link className={styles.primaryAction} href={`/imports/${encodeURIComponent(batch.batch.batch_id)}`}>
            查看逐行结果
          </Link>
          <button type="button" className={styles.secondaryAction} onClick={reset}>
            <RotateCcw size={15} />
            再导一批
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        className={styles.dropzone}
        aria-label="选择压缩包"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {stage === "reading" ? (
          <>
            <LoaderCircle className={styles.spinning} size={26} />
            <strong>正在解包并校验…</strong>
            <small>{fileName}</small>
          </>
        ) : (
          <>
            <Upload size={26} />
            <strong>{fileName || "选择或拖入 .zip 压缩包"}</strong>
            <small>
              压缩包在浏览器本地解开，图片直传对象存储，不经过后台服务器。单包最多{" "}
              {MAX_ROWS_PER_PACKAGE} 个角色。
            </small>
            <button type="button" onClick={() => inputRef.current?.click()}>
              <FileUp size={15} />
              {fileName ? "换一个包" : "选择文件"}
            </button>
          </>
        )}
      </section>

      {error && (
        <p className={styles.blocked} role="alert">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      {model && (
        <>
          <div className={styles.summaryBar} role="status">
            <span>
              共 <strong>{model.rows.length}</strong> 行
            </span>
            <span className={styles.summaryPass}>
              通过 <strong>{model.passing}</strong>
            </span>
            <span className={model.blocked > 0 ? styles.summaryFail : undefined}>
              有问题 <strong>{model.blocked}</strong>
            </span>
            {!serverChecked && serverPreflight && (
              <small className={styles.pendingServer}>服务端预检未完成，容量占用与更新目标未校验</small>
            )}
            {!serverPreflight && (
              <small className={styles.pendingServer}>fixture 数据源：仅本地校验，容量与归属未经服务端确认</small>
            )}
          </div>

          {model.packageIssues.length > 0 && (
            <ul className={styles.packageIssues}>
              {model.packageIssues.map((issue, index) => (
                <li
                  key={`${issue.code}-${index}`}
                  className={issue.severity === "error" ? styles.issueError : styles.issueNotice}
                >
                  <AlertTriangle size={13} />
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          <PreflightTable
            model={model}
            serverChecked={serverChecked}
            portraits={portraits}
            uploadFailures={uploadFailures}
          />

          <section className={styles.confirm} aria-label="确认与提交">
            <h2>确认与提交</h2>
            {!canSubmit && (
              <p className={styles.blocked}>
                <AlertTriangle size={14} />
                {submitBlockedReason}
              </p>
            )}
            <p className={styles.confirmNote}>
              只提交预检通过的 <strong>{rows.length}</strong> 行。
              {model.blocked > 0 && `有问题的 ${model.blocked} 行不参与本次导入，修好后可以重传。`}
            </p>

            <div className={styles.confirmGrid}>
              <label className={styles.field}>
                <span>
                  批次默认归属账号<b> *</b>
                </span>
                <OwnerPicker value={owner} disabled={!canSubmit || stage === "submitting"} onChange={setOwner} />
              </label>
              <label className={styles.field}>
                <span>
                  导入原因<b> *</b>
                </span>
                <input
                  value={reason}
                  maxLength={200}
                  disabled={!canSubmit || stage === "submitting"}
                  placeholder="例如：2026-09 角色补充第一批"
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </div>

            <label className={styles.acknowledge}>
              <input
                type="checkbox"
                checked={declared}
                disabled={!canSubmit || stage === "submitting"}
                onChange={(event) => setDeclared(event.target.checked)}
              />
              <span>
                我确认这批内容已获授权，且内容评级填写属实。导入不绕过机审，与创作者自建走完全相同的审核链路。
              </span>
            </label>

            {progress && (
              <div className={styles.progress}>
                <span>
                  立绘上传 {progress.completed} / {progress.total}
                  {progress.failed > 0 && ` · 失败 ${progress.failed}`}
                </span>
                <span className={styles.budgetTrack}>
                  <span
                    className={`${styles.budgetFill} ${styles.barOk}`}
                    style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }}
                  />
                </span>
              </div>
            )}

            <div className={styles.submitRow}>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={!readyToSubmit || stage === "submitting"}
                onClick={() => void submit()}
              >
                {stage === "submitting" ? <LoaderCircle className={styles.spinning} size={15} /> : null}
                提交导入
              </button>
              {canSubmit && !readyToSubmit && (
                <small className={styles.hint}>
                  {rows.length === 0
                    ? "没有可提交的行。"
                    : !owner
                      ? "请先选择归属账号。"
                      : reason.trim().length === 0
                        ? "请填写导入原因。"
                        : "请勾选授权与评级声明。"}
                </small>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

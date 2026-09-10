"use client";

import { FactoryCostPanel } from "./cost-panel";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { OwnerPicker, type OwnerAccount } from "@/features/imports/owner-picker";
import { uploadPortraitFile } from "@/features/imports/import-api";
import {
  createPreviewTurn,
  createRun,
  getDraft,
  getRun,
  preflightRun,
  retryTask,
  startRun,
  submitRun,
  updateDraft,
  characterFactoryDraftPortraitUrl,
} from "./api";
import {
  type CharacterDraft,
  type ContentMode,
  type FactoryRunSnapshot,
  type FactoryTask,
  type MixedSource,
  type PreviewMessage,
} from "./contracts";
import { resolveSingleRun } from "./single-lifecycle";
import {
  FACTORY_POLL_INTERVAL_MS,
  factoryPollRecoveryMessage,
  factoryPollRetryDelay,
} from "./polling";
import { AGENT_REVISION_FIELD_LABELS } from "./agent-revision";
import { useAgentRevision } from "./use-agent-revision";
import { RevisionImageComparison } from "./revision-image-comparison";
import { DraftPortraitImage } from "./draft-portrait-image";
import {
  isAcceptedSubmission,
  preflightIssueMessages,
  submissionFailureMessage,
} from "./submission";
import {
  uploadFactorySourceFiles,
  type FactoryUploadProgress,
} from "./media-upload";
import styles from "./factory.module.css";

type Props = {
  readonly fixtureMode: boolean;
  readonly canWrite: boolean;
  readonly blockedReason: string;
};

type Stage = "source" | "generating" | "draft" | "failed" | "submitted";
type LocalImage = { readonly id: string; readonly file: File; readonly url: string };

const FIXTURE_OWNER: OwnerAccount = {
  platformUserId: "pusr_accept_official",
  displayName: "Plum Official",
  membershipStatus: "active",
};

const EMPTY_DRAFT: CharacterDraft = {
  candidate_id: "candidate-single",
  work_id: "work-factory-fixture",
  revision: 1,
  display_name: "林间",
  gender: "female",
  intro: "深夜书店里，替你留一盏灯的人。",
  opening_scene: "雨夜，你推开书店的门。她从书页间抬眼。",
  character_settings: "夜班书店店员，寡言、敏锐，用行动表达关心。关系推进缓慢，不主动表白。",
  example_dialogues: "用户：今天不太想回家。\n林间：她把椅子拉开。‘十点关门。’",
  response_rules: "回复简短；动作描写多于情绪解释；避免快速建立亲密关系。",
  tag_ids: ["慢热", "书店", "治愈"],
  creator_declared_rating: "general",
  visibility: "private",
  owner_platform_user_id: FIXTURE_OWNER.platformUserId,
  portrait_media_id: "fixture-portrait",
  image_set_id: "fixture-image-set",
  portrait_crop: { contract_version: 2, x: 0, y: 0, width: 1, height: 1 },
  avatar_crop: { contract_version: 2, x: 0, y: 0, width: 1, height: 1 },
  portrait_position_x: 50,
  portrait_position_y: 50,
  portrait_zoom: 100,
  avatar_position_x: 50,
  avatar_position_y: 50,
  avatar_zoom: 100,
  adult_confirmed: false,
  rights_confirmed: false,
  updated_at: new Date(0).toISOString(),
};

const FLOW = [
  ["创意来源", "图片 / 文字 / 链接"],
  ["并发生成", "图像 + 投稿文字"],
  ["角色草稿", "字段与投稿一致"],
  ["修改 / 测试", "两个并列工作区"],
  ["提交", "预检与发布"],
] as const;

function modeLabel(mode: ContentMode): string {
  return mode === "limited" ? "Limited" : "Limitless";
}

function makeSource(
  url: string,
  description: string,
  sourceMediaIds: readonly string[],
): MixedSource {
  return {
    type: "mixed",
    urls: url.trim() ? [url.trim()] : [],
    source_media_ids: sourceMediaIds,
    description: description.trim(),
  };
}

function sourceValid(url: string, description: string, imageCount: number): boolean {
  return url.trim().length > 0 || description.trim().length > 0 || imageCount > 0;
}

const TASK_LABELS: Readonly<Partial<Record<FactoryTask["type"], string>>> = {
  source_parse: "链接解析",
  image_understand: "参考图理解",
  text_generate: "投稿文字",
  image_generate: "角色图片",
  assemble_draft: "草稿装配",
};

export function SingleConsole({ fixtureMode, canWrite, blockedReason }: Props) {
  const [contentMode, setContentMode] = useState<ContentMode>("limited");
  const [description, setDescription] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [creativeIntent, setCreativeIntent] = useState("");
  const [images, setImages] = useState<readonly LocalImage[]>([]);
  const [owner, setOwner] = useState<OwnerAccount | null>(fixtureMode ? FIXTURE_OWNER : null);
  const [stage, setStage] = useState<Stage>("source");
  const [runId, setRunId] = useState("");
  const [draft, setDraft] = useState<CharacterDraft | null>(fixtureMode ? EMPTY_DRAFT : null);
  const [baseline, setBaseline] = useState<CharacterDraft | null>(fixtureMode ? EMPTY_DRAFT : null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [failedTasks, setFailedTasks] = useState<readonly FactoryTask[]>([]);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploadingPortrait, setUploadingPortrait] = useState(false);
  const [sourceUploadProgress, setSourceUploadProgress] = useState<FactoryUploadProgress | null>(null);
  const startPending = useRef(false);
  const sourceUploads = useRef(new Map<File, string>());
  const sourceUploadOwner = useRef("");
  const [chat, setChat] = useState<readonly PreviewMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState("");

  const locked = stage !== "source";
  const activeFlow = stage === "source" ? 0 : stage === "generating" || stage === "failed" ? 1 : stage === "submitted" ? 4 : 2;
  const dirty = draft !== null && baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
  const onAgentDraftUpdated = useCallback((next: CharacterDraft) => {
    if (draft?.portrait_media_id !== next.portrait_media_id) setPortraitUrl(null);
    setDraft(next);
    setBaseline(next);
    setChat([]);
  }, [draft?.portrait_media_id]);
  const revision = useAgentRevision({
    runId,
    candidateId: draft?.candidate_id ?? "",
    fixtureMode,
    canWrite,
    blockedReason,
    draft,
    baseline,
    dirty,
    onDraftUpdated: onAgentDraftUpdated,
    setError,
  });

  const applyRunSnapshot = useCallback(async (snapshot: FactoryRunSnapshot, signal?: AbortSignal) => {
    const currentFailures = snapshot.tasks.filter((task) => task.is_current && task.status === "failed");
    setFailedTasks(currentFailures);
    const resolution = resolveSingleRun(snapshot);
    if (resolution.type === "poll") {
      setStage("generating");
      setError("");
      return true;
    }
    if (resolution.type === "failed") {
      setStage("failed");
      setError(resolution.message);
      return false;
    }

    const draftResponse = await getDraft(resolution.candidateId, signal);
    if (signal?.aborted) return false;
    setDraft(draftResponse.data);
    setBaseline(draftResponse.data);
    setStage("draft");
    setError(currentFailures.length > 0
      ? `草稿已生成，但 ${currentFailures.length} 个任务失败，可在下方单独重试。`
      : "");
    return false;
  }, []);

  useEffect(() => {
    if (fixtureMode || !runId || stage !== "generating") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;

    async function poll() {
      try {
        const response = await getRun(runId, controller.signal);
        if (controller.signal.aborted) return;
        consecutiveFailures = 0;
        if (await applyRunSnapshot(response.data, controller.signal)) {
          timer = setTimeout(poll, FACTORY_POLL_INTERVAL_MS);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          consecutiveFailures += 1;
          const retryDelay = factoryPollRetryDelay(caught, consecutiveFailures);
          if (retryDelay !== null) {
            setError(factoryPollRecoveryMessage(consecutiveFailures));
            timer = setTimeout(poll, retryDelay);
          } else {
            setStage("failed");
            setError(caught instanceof Error ? caught.message : "读取生成结果失败。");
          }
        }
      }
    }

    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [applyRunSnapshot, fixtureMode, runId, stage]);

  function addImages(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files).slice(0, 6 - images.length).map((file) => ({
      id: `image:${crypto.randomUUID()}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setImages((current) => [...current, ...next]);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function generate() {
    if (startPending.current) return;
    let runStarted = false;
    setError("");
    setSourceUploadProgress(null);
    if (!sourceValid(competitorUrl, description, images.length)) {
      setError("候选图片、文字描述、竞品链接至少填写一项。");
      return;
    }
    if (!owner) {
      setError("请选择角色归属账号。");
      return;
    }
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    startPending.current = true;
    setStage("generating");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        setRunId(`fixture-${crypto.randomUUID().slice(0, 8)}`);
        const generated = {
          ...EMPTY_DRAFT,
          creator_declared_rating: contentMode === "limited" ? "general" : "mature",
          owner_platform_user_id: owner.platformUserId,
          character_settings: description.trim() || EMPTY_DRAFT.character_settings,
        } satisfies CharacterDraft;
        setDraft(generated);
        setBaseline(generated);
        setPortraitUrl(images[0]?.url ?? null);
        setStage("draft");
        return;
      }
      if (images.length > 0) {
        if (sourceUploadOwner.current !== owner.platformUserId) {
          sourceUploads.current = new Map();
          sourceUploadOwner.current = owner.platformUserId;
        }
      }
      const uploaded = await uploadFactorySourceFiles(
        images.map((image) => image.file),
        owner.platformUserId,
        { done: sourceUploads.current, onProgress: setSourceUploadProgress },
      );
      sourceUploads.current = new Map(uploaded.uploaded);
      if (uploaded.failures.length > 0) {
        throw new Error(`${uploaded.failures[0].file.name}：${uploaded.failures[0].message}`);
      }
      setSourceUploadProgress(null);
      const sourceMediaIds = uploaded.mediaIds.filter((id): id is string => id !== null);
      const idempotencyKey = crypto.randomUUID();
      const created = await createRun(
        {
          kind: "single",
          content_mode: contentMode,
          source: makeSource(competitorUrl, description, sourceMediaIds),
          creative_intent: creativeIntent.trim(),
          language: "zh-CN",
          market: "global",
          owner_platform_user_id: owner.platformUserId,
          target_count: 1,
        },
        idempotencyKey,
      );
      const started = await startRun(created.data.run.id, crypto.randomUUID());
      runStarted = true;
      setRunId(created.data.run.id);
      await applyRunSnapshot(started.data);
    } catch (caught) {
      const canRecoverByPolling = runStarted && factoryPollRetryDelay(caught, 1) !== null;
      setStage(canRecoverByPolling ? "generating" : runStarted ? "failed" : "source");
      setError(canRecoverByPolling
        ? factoryPollRecoveryMessage(1)
        : caught instanceof Error ? caught.message : "启动生成失败。");
    } finally {
      startPending.current = false;
    }
  }

  async function retryFailedTasks() {
    if (!failedTasks.length || retryingFailed) return;
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setRetryingFailed(true);
    setError("");
    try {
      const responses = await Promise.all(
        failedTasks.map((task) => retryTask(task.id, crypto.randomUUID())),
      );
      const latest = responses.at(-1);
      if (latest) await applyRunSnapshot(latest.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重试失败任务失败。");
    } finally {
      setRetryingFailed(false);
    }
  }

  function update<K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveDraft() {
    if (!draft || !baseline) {
      setError("角色草稿尚未加载，无法保存。");
      return;
    }
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const saved = { ...draft, revision: draft.revision + 1, updated_at: new Date().toISOString() };
        setDraft(saved);
        setBaseline(saved);
      } else {
        const response = await updateDraft(
          draft.candidate_id,
          baseline.revision,
          draft,
          crypto.randomUUID(),
        );
        setDraft(response.data);
        setBaseline(response.data);
      }
      setChat([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存草稿失败。");
    } finally {
      setSaving(false);
    }
  }

  async function replaceDraftPortrait(file: File) {
    if (!draft || !baseline || uploadingPortrait) return;
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setUploadingPortrait(true);
    setError("");
    try {
      if (fixtureMode) {
        const next = {
          ...draft,
          portrait_media_id: `fixture:${file.name}`,
          updated_at: new Date().toISOString(),
        };
        setDraft(next);
        setBaseline(next);
      } else {
        const portrait = await uploadPortraitFile(file, draft.owner_platform_user_id);
        const next = {
          ...draft,
          portrait_media_id: portrait.mediaId,
          image_set_id: portrait.imageSetId,
          portrait_crop: portrait.portraitCrop,
          avatar_crop: portrait.avatarCrop,
        };
        const response = await updateDraft(
          draft.candidate_id,
          baseline.revision,
          next,
          crypto.randomUUID(),
        );
        setDraft(response.data);
        setBaseline(response.data);
      }
      setPortraitUrl(URL.createObjectURL(file));
      setChat([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "角色图片上传失败。");
    } finally {
      setUploadingPortrait(false);
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || testing || !draft) return;
    if (dirty) {
      setError("请先保存草稿，再测试最新角色效果。");
      return;
    }
    const nextChat: readonly PreviewMessage[] = [...chat, { role: "user", content: text }];
    setChat(nextChat);
    setChatInput("");
    setTesting(true);
    setError("");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        setChat([...nextChat, {
          role: "assistant",
          content: draft.display_name
            ? `她停了一下，看向你。“${text.includes("回家") ? "那就再坐一会儿。" : "我在听。"}”`
            : "角色草稿还缺少名称。",
        }]);
      } else {
        const response = await createPreviewTurn(
          draft.candidate_id,
          { expected_revision: draft.revision, message: text, history: chat },
          crypto.randomUUID(),
        );
        setChat([...nextChat, {
          role: "assistant",
          content: response.data.display_content || response.data.reply,
        }]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "对话测试失败。");
    } finally {
      setTesting(false);
    }
  }

  async function submit() {
    if (!draft) {
      setError("角色草稿尚未加载，无法提交。");
      return;
    }
    if (!reason.trim() || !confirmed) {
      setError("请填写提交原因并确认成人内容与素材权利声明。");
      return;
    }
    if (dirty) {
      setError("请先保存草稿，再提交最新内容。");
      return;
    }
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setError("");
    try {
      if (fixtureMode) {
        setSubmissionReceipt("已发布 · fixture-character");
        setStage("submitted");
        return;
      }
      const preflight = await preflightRun(runId, [draft.candidate_id], crypto.randomUUID());
      const checked = preflight.data.candidates.find((candidate) => candidate.id === draft.candidate_id);
      if (!checked || checked.preflight?.ready !== true) {
        setError(checked ? preflightIssueMessages(checked).join("；") : "服务端未返回该角色的预检结果。");
        return;
      }
      const response = await submitRun(
        runId,
        {
          reason: reason.trim(),
          adult_confirmed: true,
          rights_confirmed: true,
          candidate_ids: [draft.candidate_id],
        },
        crypto.randomUUID(),
      );
      const submitted = response.data.candidates.find((candidate) => candidate.id === draft.candidate_id);
      if (!submitted || !isAcceptedSubmission(submitted)) {
        setError(submitted ? submissionFailureMessage(submitted) ?? "服务端未返回投稿回执。" : "服务端未返回该角色的投稿结果。");
        return;
      }
      const receipt = submitted.submission;
      setSubmissionReceipt(
        `${receipt?.status === "published" ? "已发布" : "待审核"} · ${receipt?.character_id || receipt?.review_id || submitted.id}`,
      );
      setStage("submitted");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败。");
    }
  }

  return (
    <div className={styles.workspace}>
      {!canWrite && <p className={styles.notice}><AlertTriangle size={15} />{blockedReason}</p>}
      {error && <p className={styles.error} role="status"><AlertTriangle size={15} />{error}</p>}
      {sourceUploadProgress && <p className={styles.notice}><LoaderCircle className={styles.spin} size={15} />正在上传参考图 {sourceUploadProgress.completed} / {sourceUploadProgress.total}{sourceUploadProgress.failed ? ` · ${sourceUploadProgress.failed} 失败` : ""}</p>}
      {uploadingPortrait && <p className={styles.notice}><LoaderCircle className={styles.spin} size={15} />正在上传立绘并生成图片集</p>}

      <div className={styles.flow} aria-label="单角色生成流程">
        {FLOW.map(([title, detail], index) => (
          <div key={title} className={`${styles.flowStep} ${index === activeFlow ? styles.flowStepActive : ""}`}>
            <strong>{index + 1}. {title}</strong><small>{detail}</small>
          </div>
        ))}
      </div>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><span className={styles.sectionIndex}>01</span><div><h2>创意来源</h2><p>图片、文字、竞品链接可以任意组合，至少一项非空</p></div></div>
          {locked && <span className={styles.statusPill} data-tone="good"><Check size={12} />已锁定</span>}
        </header>
        <div className={styles.sectionBody}>
          <div className={styles.modeGrid}>
            {(["limited", "limitless"] as const).map((mode) => (
              <button
                className={`${styles.modeChoice} ${contentMode === mode ? (mode === "limited" ? styles.limitedActive : styles.limitlessActive) : ""}`}
                type="button"
                key={mode}
                disabled={locked}
                onClick={() => setContentMode(mode)}
              >
                {contentMode === mode ? <CheckCircle2 size={17} /> : <span />}
                <strong>{modeLabel(mode)}</strong>
                <small>{mode === "limited" ? "图文提示词禁止成人向内容" : "图文提示词允许合规成人向内容"}</small>
              </button>
            ))}
          </div>
          <div className={styles.formGrid}>
            <div className={styles.wideField}><label htmlFor="single-url">竞品作品链接</label><input id="single-url" disabled={locked} value={competitorUrl} onChange={(event) => setCompetitorUrl(event.target.value)} placeholder="https://..." /></div>
            <div className={styles.wideField}><label htmlFor="single-description">文字描述</label><textarea id="single-description" disabled={locked} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="角色风格、背景、关系张力或已有设定" /></div>
            <div className={styles.wideField}>
              <span className={styles.label}>候选图片</span>
              <label className={styles.dropzone}><input disabled={locked} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => addImages(event.target.files)} /><ImagePlus size={22} /><strong>添加参考图片</strong><small>可不上传，最多 6 张；多图共同构成参考</small></label>
              {images.length > 0 && <div className={styles.imageStrip}>{images.map((image) => <div className={styles.imageTile} key={image.id}><Image src={image.url} alt={image.file.name} fill sizes="120px" unoptimized /><button disabled={locked} type="button" onClick={() => removeImage(image.id)} aria-label={`移除 ${image.file.name}`}><X size={13} /></button></div>)}</div>}
            </div>
            <div className={styles.wideField}><label htmlFor="single-intent">创作意图</label><textarea id="single-intent" disabled={locked} value={creativeIntent} onChange={(event) => setCreativeIntent(event.target.value)} placeholder="希望保留什么、修正什么，以及上线后的目标体验" /></div>
            <div className={styles.wideField}><span className={styles.label}>角色归属</span><OwnerPicker value={owner} disabled={locked} onChange={setOwner} /></div>
          </div>
          <div className={styles.footerActions}><p>当前：{modeLabel(contentMode)} · 图像和文字并发生成</p><button className={styles.primaryButton} type="button" disabled={locked || !canWrite} onClick={generate}>{stage === "generating" ? <LoaderCircle className={styles.spin} size={14} /> : <Sparkles size={14} />}生成角色</button></div>
        </div>
      </section>

      {(stage === "generating" || stage === "failed" || failedTasks.length > 0) && <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>02</span><div><h2>并发生成</h2><p>两路独立执行，失败可以单独重试</p></div></div><span className={styles.statusPill} data-tone={failedTasks.length > 0 || stage === "failed" ? "bad" : "warn"}>{failedTasks.length > 0 || stage === "failed" ? <AlertTriangle size={12} /> : <LoaderCircle className={styles.spin} size={12} />}{failedTasks.length > 0 ? "部分失败" : stage === "failed" ? "生成失败" : "生成中"}</span></header><div className={styles.sectionBody}><div className={styles.generationLanes}><div className={styles.lane}><strong>{stage === "generating" && <LoaderCircle className={styles.spin} size={15} />}角色图片</strong><p>{modeLabel(contentMode)} policy 已写入图像提示词</p></div><div className={styles.lane}><strong>{stage === "generating" && <LoaderCircle className={styles.spin} size={15} />}投稿文字</strong><p>按真实投稿字段返回结构化内容</p></div></div>{failedTasks.length > 0 && <div className={styles.footerActions}><p>失败：{failedTasks.map((task) => TASK_LABELS[task.type] ?? task.type).join("、")}；自动重试已用完</p><button className={styles.secondaryButton} disabled={retryingFailed || !canWrite} type="button" onClick={retryFailedTasks}>{retryingFailed ? <LoaderCircle className={styles.spin} size={13} /> : <RefreshCw size={13} />}{retryingFailed ? "重试中" : "重试失败任务"}</button></div>}</div></section>}

      {(stage === "draft" || stage === "submitted") && draft && <>
        <DraftSection
          draft={draft}
          portraitUrl={portraitUrl}
          fixtureMode={fixtureMode}
          dirty={dirty}
          saving={saving}
          uploadingPortrait={uploadingPortrait}
          canWrite={canWrite}
          onChange={update}
          onRegenerate={() => revision.changeMode("image")}
          onReplacePortrait={replaceDraftPortrait}
          onReset={() => setDraft(baseline)}
          onSave={saveDraft}
        />
        <div className={styles.parallelGrid}>
          <section className={styles.section}>
            <header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>04</span><div><h3>描述修改</h3><p>Agent 修改先预览，确认后写入草稿</p></div></div></header>
            <div className={styles.sectionBody}>
              <div className={styles.segmented}>
                <button disabled={revision.busy || revision.applying} className={revision.mode === "text" ? styles.segmentActive : ""} type="button" onClick={() => revision.changeMode("text")}>改文字</button>
                <button disabled={revision.busy || revision.applying} className={revision.mode === "image" ? styles.segmentActive : ""} type="button" onClick={() => revision.changeMode("image")}>改图片</button>
              </div>
              <textarea disabled={revision.busy || revision.applying} className={styles.promptInput} value={revision.instruction} onChange={(event) => revision.setInstruction(event.target.value)} placeholder={revision.mode === "text" ? "例：让她更克制，用行动代替直接安慰" : "例：背景改成雨夜，服装和面部保持不变"} />
              {revision.unavailableMessage && <p className={styles.notice} role="status"><AlertTriangle size={14} />{revision.unavailableMessage}</p>}
              <button className={styles.primaryButton} disabled={!revision.instruction.trim() || revision.busy || revision.applying || !canWrite} type="button" onClick={revision.generatePreview}>{revision.busy ? <LoaderCircle className={styles.spin} size={13} /> : <Sparkles size={13} />}{revision.busy ? "Agent 修改中" : "生成修改预览"}</button>
              {revision.preview && <div className={styles.revisionPreview}>
                <strong>{revision.mode === "text" ? "文字修改预览" : "图片修改预览"} · 基于草稿 v{revision.preview.expected_revision}</strong>
                {"changes" in revision.preview ? <div className={styles.revisionChanges}>
                  {revision.preview.changes.map((change) => <div className={styles.revisionChange} key={change.field}>
                    <b>{AGENT_REVISION_FIELD_LABELS[change.field]}</b>
                    <div><small>修改前</small><p>{change.before || "（空）"}</p></div>
                    <div><small>修改后</small><p>{change.after || "（空）"}</p></div>
                  </div>)}
                </div> : <RevisionImageComparison
                  candidateId={draft.candidate_id}
                  taskId={revision.previewTaskId}
                  fixtureMode={fixtureMode}
                />}
                <div className={styles.inlineActions}><button className={styles.ghostButton} disabled={revision.applying} type="button" onClick={revision.dismissPreview}>撤销</button><button className={styles.primaryButton} disabled={revision.applying || !canWrite} type="button" onClick={revision.applyPreview}>{revision.applying ? <LoaderCircle className={styles.spin} size={13} /> : <Check size={13} />}应用修改</button></div>
              </div>}
            </div>
          </section>
          <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>05</span><div><h3>对话测试</h3><p>读取草稿 v{draft.revision}，测试消息不写回设定</p></div></div><button className={styles.ghostButton} type="button" onClick={() => setChat([])}>重新开始</button></header><div className={styles.sectionBody}><div className={styles.chat}>{chat.length === 0 && <div className={styles.message}><small>{draft.display_name} · 草稿 v{draft.revision}</small>雨还没停。要进来坐一会儿吗？</div>}{chat.map((message, index) => <div key={`${message.role}-${index}`} className={`${styles.message} ${message.role === "user" ? styles.userMessage : ""}`}><small>{message.role === "user" ? "模拟用户" : draft.display_name}</small>{message.content}</div>)}{testing && <div className={styles.message}><small>{draft.display_name}</small><LoaderCircle className={styles.spin} size={13} /></div>}</div><form className={styles.chatForm} onSubmit={sendChat}><input className={styles.chatInput} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="输入测试消息" aria-label="输入测试消息" /><button type="submit" disabled={testing} aria-label="发送"><Send size={14} /></button></form></div></section>
        </div>
        <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>06</span><div><h2>提交作品草稿</h2><p>继续走真实投稿预检、机审与发布链路</p></div></div>{stage === "submitted" && <span className={styles.statusPill} data-tone="good"><CheckCircle2 size={12} />已提交</span>}</header><div className={styles.sectionBody}><div className={styles.formGrid}><div className={styles.wideField}><label htmlFor="single-reason">提交原因</label><input id="single-reason" value={reason} disabled={stage === "submitted"} onChange={(event) => setReason(event.target.value)} placeholder="例：角色工厂首批补充" /></div><label className={`${styles.checkRow} ${styles.wideField}`}><input type="checkbox" checked={confirmed} disabled={stage === "submitted"} onChange={(event) => setConfirmed(event.target.checked)} /><span>确认角色均为成年人或无成人内容，并拥有或已取得所用素材的必要权利。</span></label></div><div className={styles.footerActions}><p>{stage === "submitted" ? `回执：${submissionReceipt}` : "提交前将再次校验字段、图片、标签、评级与归属"}</p><button className={styles.primaryButton} type="button" disabled={stage === "submitted"} onClick={submit}><CheckCircle2 size={14} />提交作品草稿</button></div></div></section>
      </>}
      {runId && <FactoryCostPanel runId={runId} active={stage === "generating" || revision.busy || testing} refreshKey={`${stage}-${revision.previewTaskId}-${testing}`} candidates={draft ? [{ id: draft.candidate_id, title: draft.display_name }] : []} />}
    </div>
  );
}

function DraftSection({
  draft,
  portraitUrl,
  fixtureMode,
  dirty,
  saving,
  uploadingPortrait,
  canWrite,
  onChange,
  onRegenerate,
  onReplacePortrait,
  onReset,
  onSave,
}: {
  readonly draft: CharacterDraft;
  readonly portraitUrl: string | null;
  readonly fixtureMode: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly uploadingPortrait: boolean;
  readonly canWrite: boolean;
  readonly onChange: <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => void;
  readonly onRegenerate: () => void;
  readonly onReplacePortrait: (file: File) => void;
  readonly onReset: () => void;
  readonly onSave: () => void;
}) {
  const displayedPortraitUrl = portraitUrl ?? (
    fixtureMode ? null : characterFactoryDraftPortraitUrl(draft.candidate_id, draft.revision)
  );
  function replacePortrait(files: FileList | null) {
    if (uploadingPortrait) return;
    const file = files?.[0];
    if (!file) return;
    onReplacePortrait(file);
  }
  return <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>03</span><div><h2>角色草稿</h2><p>字段与当前真实投稿保持一致</p></div></div><span className={styles.statusPill} data-tone={dirty ? "warn" : "good"}>{dirty ? "有未保存修改" : <><Check size={12} />草稿 v{draft.revision}</>}</span></header><div className={styles.sectionBody}><div className={styles.draftGrid}><div className={styles.portraitPanel}><div className={styles.portrait}><DraftPortraitImage src={displayedPortraitUrl} displayName={draft.display_name} emptyLabel="生成图片预览" /></div><div className={styles.inlineActions}><label className={styles.secondaryButton}><Upload size={13} />上传替换<input className={styles.srOnly} type="file" accept="image/*" onChange={(event) => replacePortrait(event.target.files)} /></label><button className={styles.secondaryButton} type="button" onClick={onRegenerate}><RefreshCw size={13} />重新生成</button></div></div><div className={styles.formGrid}><div className={styles.field}><label>名称</label><input value={draft.display_name} onChange={(event) => onChange("display_name", event.target.value)} /></div><div className={styles.field}><label>性别</label><select value={draft.gender} onChange={(event) => onChange("gender", event.target.value as CharacterDraft["gender"])}><option value="female">女</option><option value="male">男</option><option value="non_binary">非二元</option></select></div><div className={styles.wideField}><label>简介</label><input value={draft.intro} onChange={(event) => onChange("intro", event.target.value)} /></div><div className={styles.wideField}><label>开场场景</label><textarea value={draft.opening_scene} onChange={(event) => onChange("opening_scene", event.target.value)} /></div><div className={`${styles.wideField} ${styles.tall}`}><label>角色设定</label><textarea value={draft.character_settings} onChange={(event) => onChange("character_settings", event.target.value)} /></div><div className={styles.wideField}><label>示例对话</label><textarea value={draft.example_dialogues} onChange={(event) => onChange("example_dialogues", event.target.value)} /></div><div className={styles.wideField}><label>回复规则</label><textarea value={draft.response_rules} onChange={(event) => onChange("response_rules", event.target.value)} /></div><div className={styles.field}><label>标签 ID</label><input value={draft.tag_ids.join(", ")} onChange={(event) => onChange("tag_ids", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></div><div className={styles.field}><label>内容评级</label><select value={draft.creator_declared_rating} onChange={(event) => onChange("creator_declared_rating", event.target.value as CharacterDraft["creator_declared_rating"])}><option value="general">一般级</option><option value="mature">成人级</option></select></div><div className={styles.field}><label>可见性</label><select value={draft.visibility} onChange={(event) => onChange("visibility", event.target.value as CharacterDraft["visibility"])}><option value="private">私密</option><option value="public">公开</option></select></div><div className={styles.field}><label>归属账号</label><input value={draft.owner_platform_user_id} readOnly /></div></div></div><div className={styles.footerActions}><button className={styles.ghostButton} disabled={!dirty || saving} type="button" onClick={onReset}>撤销手动修改</button><button className={styles.primaryButton} disabled={!dirty || saving || !canWrite} type="button" onClick={onSave}>{saving ? <LoaderCircle className={styles.spin} size={14} /> : <Check size={14} />}保存草稿</button></div></div></section>;
}

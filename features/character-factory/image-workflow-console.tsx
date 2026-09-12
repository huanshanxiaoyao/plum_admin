"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OwnerPicker, type OwnerAccount } from "@/features/imports/owner-picker";
import {
  characterFactoryImageMediaUrl,
  confirmImagePrompt,
  createImageRun,
  editImageVersion,
  finalizeImageVersion,
  generateImageCandidates,
  generateImagePrompt,
  getImageRun,
  retryImageTask,
  selectImageCandidate,
} from "./api";
import type {
  ContentMode,
  ImageAspectRatio,
  ImageCandidate,
  ImagePromptVersion,
  ImageRunSnapshot,
  ImageRunStatus,
  ImageVersion,
} from "./contracts";
import { uploadFactorySourceFiles } from "./media-upload";
import { imageRunInputReady, imageWorkflowStep, shouldPollImageRun } from "./image-workflow";
import {
  FACTORY_POLL_INTERVAL_MS,
  factoryPollRecoveryMessage,
  factoryPollRetryDelay,
} from "./polling";
import styles from "./image-workflow.module.css";

type Props = {
  readonly fixtureMode: boolean;
  readonly canWrite: boolean;
  readonly blockedReason: string;
};

type LocalUpload = { readonly file: File; readonly url: string };

const FIXTURE_OWNER: OwnerAccount = {
  platformUserId: "pusr_accept_official",
  displayName: "Plum Official",
  membershipStatus: "active",
};
const SAMPLE_IMAGE = "/character-factory/midjourney-sample.png";
const ASPECT_RATIOS: readonly ImageAspectRatio[] = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const FLOW = [
  ["输入创意", "描述 / 竞品图"],
  ["确认 Prompt", "ChatGPT"],
  ["候选图", "Midjourney"],
  ["多轮修图", "ChatGPT"],
  ["定稿", "最终版本"],
] as const;
const TASK_LABELS = {
  prompt_generate: "Prompt 生成",
  image_generate: "候选图生成",
  image_edit: "图片修改",
} as const;

function mediaUrl(runId: string, item: ImageCandidate | ImageVersion): string {
  return item.image_url || characterFactoryImageMediaUrl(runId, item.media_id);
}

function makeFixtureSnapshot(
  status: ImageRunStatus,
  overrides: Partial<ImageRunSnapshot> = {},
): ImageRunSnapshot {
  const now = new Date().toISOString();
  const run = {
    id: "image-run-fixture",
    revision: 1,
    owner_platform_user_id: FIXTURE_OWNER.platformUserId,
    content_mode: "limited" as const,
    description: "极简陶器角色道具，柔和自然光，安静但有生命感。",
    reference_media_ids: [],
    generation_reference_media_id: null,
    aspect_ratio: "1:1" as const,
    status,
    active_prompt_version_id: status === "input" || status === "prompting" ? null : "prompt-1",
    selected_candidate_id: null,
    current_version_id: null,
    final_version_id: null,
    error: null,
    created_at: now,
    updated_at: now,
  };
  return { run, prompts: [], candidates: [], versions: [], tasks: [], ...overrides };
}

function fixturePrompt(): ImagePromptVersion {
  return {
    id: "prompt-1",
    version: 1,
    content: "minimal editorial portrait of a hand-shaped white ceramic vessel, subtle organic asymmetry, calm human presence, warm gray studio background, soft directional morning light, tactile matte texture, centered composition, restrained color palette, premium character key art --stylize 180",
    analysis: {
      subject: "拟人感白色陶器",
      scene: "极简摄影棚",
      composition: "居中近景",
      lighting: "柔和侧光",
      visual_style: "克制、真实材质",
    },
    confirmed_at: null,
    created_at: new Date().toISOString(),
  };
}

function fixtureCandidates(): readonly ImageCandidate[] {
  const now = new Date().toISOString();
  return Array.from({ length: 4 }, (_, index) => ({
    id: `candidate-${index + 1}`,
    ordinal: index + 1,
    media_id: `fixture-media-${index + 1}`,
    image_url: SAMPLE_IMAGE,
    created_at: now,
  }));
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function activePrompt(snapshot: ImageRunSnapshot): ImagePromptVersion | null {
  return snapshot.prompts.find((prompt) => prompt.id === snapshot.run.active_prompt_version_id)
    ?? snapshot.prompts.at(-1)
    ?? null;
}

function setRunQuery(runId: string | null) {
  const url = new URL(window.location.href);
  if (runId) url.searchParams.set("run", runId);
  else url.searchParams.delete("run");
  window.history.replaceState(window.history.state, "", url);
}

function UploadField({
  label,
  upload,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly upload: LocalUpload | null;
  readonly disabled: boolean;
  readonly onChange: (upload: LocalUpload | null) => void;
}) {
  function choose(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    onChange({ file, url: URL.createObjectURL(file) });
  }

  return (
    <div className={styles.uploadField}>
      <span>{label}</span>
      {upload ? (
        <div className={styles.uploadPreview}>
          <Image src={upload.url} alt={upload.file.name} fill sizes="220px" unoptimized />
          <button type="button" disabled={disabled} onClick={() => onChange(null)} aria-label={`移除 ${upload.file.name}`}><X size={13} /></button>
          <small>{upload.file.name}</small>
        </div>
      ) : (
        <label className={styles.dropzone}>
          <input disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choose(event.target.files)} />
          <ImagePlus size={20} />
          <strong>上传图片</strong>
          <small>PNG / JPG / WebP</small>
        </label>
      )}
    </div>
  );
}

export function ImageWorkflowConsole({ fixtureMode, canWrite, blockedReason }: Props) {
  const [owner, setOwner] = useState<OwnerAccount | null>(fixtureMode ? FIXTURE_OWNER : null);
  const [description, setDescription] = useState("");
  const [contentMode, setContentMode] = useState<ContentMode>("limited");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("1:1");
  const [sourceImage, setSourceImage] = useState<LocalUpload | null>(null);
  const [conditioningImage, setConditioningImage] = useState<LocalUpload | null>(null);
  const [snapshot, setSnapshot] = useState<ImageRunSnapshot | null>(null);
  const [promptText, setPromptText] = useState("");
  const [promptInstruction, setPromptInstruction] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState<"prompt" | "confirm" | "generate" | "select" | "edit" | "finalize" | "retry" | "">("");
  const [error, setError] = useState("");

  const currentPrompt = useMemo(() => {
    if (!snapshot) return null;
    return activePrompt(snapshot);
  }, [snapshot]);
  const versions = snapshot?.versions ?? [];
  const currentVersion = versions.find((version) => version.id === selectedVersionId)
    ?? versions.find((version) => version.id === snapshot?.run.current_version_id)
    ?? versions.at(-1)
    ?? null;
  const previousVersion = currentVersion?.parent_version_id
    ? versions.find((version) => version.id === currentVersion.parent_version_id) ?? null
    : null;
  const flowIndex = imageWorkflowStep(snapshot?.run.status ?? "empty");
  const inputLocked = snapshot !== null;
  const pollable = snapshot
    ? shouldPollImageRun(snapshot.run.status, snapshot.tasks.map((task) => task.status))
    : false;
  const activeRunId = snapshot?.run.id ?? null;
  const failedTasks = snapshot?.tasks.filter((task) => task.is_current && task.status === "failed") ?? [];

  const applyRemoteSnapshot = useCallback((next: ImageRunSnapshot) => {
    const prompt = activePrompt(next);
    setSnapshot(next);
    setDescription(next.run.description);
    setContentMode(next.run.content_mode);
    setAspectRatio(next.run.aspect_ratio);
    setOwner((current) => current?.platformUserId === next.run.owner_platform_user_id
      ? current
      : {
          platformUserId: next.run.owner_platform_user_id,
          displayName: "已绑定账号",
          membershipStatus: "active",
        });
    setPromptText(prompt?.content ?? "");
    setSelectedCandidateId(next.run.selected_candidate_id ?? "");
    setSelectedVersionId(next.run.current_version_id ?? "");
  }, []);

  useEffect(() => {
    if (fixtureMode) return;
    const runId = new URL(window.location.href).searchParams.get("run");
    if (!runId) return;
    const controller = new AbortController();
    getImageRun(runId, controller.signal)
      .then((response) => applyRemoteSnapshot(response.data))
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught, "任务恢复失败。"));
      });
    return () => controller.abort();
  }, [applyRemoteSnapshot, fixtureMode]);

  useEffect(() => {
    if (!activeRunId || fixtureMode || !pollable) return;
    const runId = activeRunId;
    const controller = new AbortController();
    let timer = 0;
    let consecutiveFailures = 0;

    async function poll() {
      try {
        const response = await getImageRun(runId, controller.signal);
        consecutiveFailures = 0;
        applyRemoteSnapshot(response.data);
        setError("");
        if (shouldPollImageRun(response.data.run.status, response.data.tasks.map((task) => task.status))) {
          timer = window.setTimeout(poll, FACTORY_POLL_INTERVAL_MS);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        consecutiveFailures += 1;
        const retryDelay = factoryPollRetryDelay(caught, consecutiveFailures);
        if (retryDelay === null) {
          setError(errorMessage(caught, "任务状态刷新失败。"));
          return;
        }
        setError(factoryPollRecoveryMessage(consecutiveFailures));
        timer = window.setTimeout(poll, retryDelay);
      }
    }

    timer = window.setTimeout(poll, FACTORY_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeRunId, applyRemoteSnapshot, fixtureMode, pollable]);

  useEffect(() => () => {
    if (sourceImage) URL.revokeObjectURL(sourceImage.url);
  }, [sourceImage]);

  useEffect(() => () => {
    if (conditioningImage) URL.revokeObjectURL(conditioningImage.url);
  }, [conditioningImage]);

  async function upload(file: File): Promise<string> {
    if (!owner) throw new Error("请先选择归属账号。");
    const result = await uploadFactorySourceFiles([file], owner.platformUserId);
    const mediaId = result.mediaIds[0];
    if (!mediaId) throw new Error(result.failures[0]?.message ?? "图片上传失败。");
    return mediaId;
  }

  async function createPrompt() {
    if (!description.trim() && !sourceImage) {
      setError("画面描述和竞品图片至少提供一项。");
      return;
    }
    if (!owner) {
      setError("请选择图片归属账号。");
      return;
    }
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setBusy("prompt");
    setError("");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        const prompt = fixturePrompt();
        const base = makeFixtureSnapshot("prompt_ready");
        setSnapshot(makeFixtureSnapshot("prompt_ready", {
          run: {
            ...base.run,
            description: description.trim(),
            content_mode: contentMode,
            aspect_ratio: aspectRatio,
            active_prompt_version_id: prompt.id,
          },
          prompts: [prompt],
        }));
        setPromptText(prompt.content);
        return;
      }
      const referenceMediaIds = sourceImage ? [await upload(sourceImage.file)] : [];
      const created = await createImageRun({
        owner_platform_user_id: owner.platformUserId,
        content_mode: contentMode,
        description: description.trim(),
        reference_media_ids: referenceMediaIds,
        aspect_ratio: aspectRatio,
      }, crypto.randomUUID());
      applyRemoteSnapshot(created.data);
      setRunQuery(created.data.run.id);
        const prompted = await generateImagePrompt(created.data.run.id, {
          expected_revision: created.data.run.revision,
        }, crypto.randomUUID());
      applyRemoteSnapshot(prompted.data);
    } catch (caught) {
      setError(errorMessage(caught, "Prompt 生成失败。"));
    } finally {
      setBusy("");
    }
  }

  async function retryPrompt() {
    if (!snapshot || fixtureMode) return;
    setBusy("prompt");
    setError("");
    try {
      const latest = await getImageRun(snapshot.run.id);
      applyRemoteSnapshot(latest.data);
      if (activePrompt(latest.data) || shouldPollImageRun(latest.data.run.status, latest.data.tasks.map((task) => task.status))) return;
      const prompted = await generateImagePrompt(snapshot.run.id, {
        expected_revision: latest.data.run.revision,
      }, crypto.randomUUID());
      applyRemoteSnapshot(prompted.data);
    } catch (caught) {
      setError(errorMessage(caught, "Prompt 生成失败。"));
    } finally {
      setBusy("");
    }
  }

  async function retryFailedTasks() {
    if (!snapshot || failedTasks.length === 0) return;
    setBusy("retry");
    setError("");
    try {
      const task = failedTasks[0];
      if (!task) return;
      const results = await Promise.allSettled([
        retryImageTask(snapshot.run.id, task.id, snapshot.run.revision, crypto.randomUUID()),
      ]);
      const latest = await getImageRun(snapshot.run.id);
      applyRemoteSnapshot(latest.data);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    } catch (caught) {
      setError(errorMessage(caught, "失败任务重试失败。"));
    } finally {
      setBusy("");
    }
  }

  async function regeneratePrompt() {
    if (!snapshot || !promptInstruction.trim()) return;
    setBusy("prompt");
    setError("");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        const prompt = { ...fixturePrompt(), id: `prompt-${snapshot.prompts.length + 1}`, version: snapshot.prompts.length + 1, content: `${promptText}\n${promptInstruction.trim()}` };
        setSnapshot({ ...snapshot, prompts: [...snapshot.prompts, prompt], run: { ...snapshot.run, active_prompt_version_id: prompt.id } });
        setPromptText(prompt.content);
      } else {
        const response = await generateImagePrompt(snapshot.run.id, {
          expected_revision: snapshot.run.revision,
          instruction: promptInstruction.trim(),
        }, crypto.randomUUID());
        applyRemoteSnapshot(response.data);
      }
      setPromptInstruction("");
    } catch (caught) {
      setError(errorMessage(caught, "Prompt 重写失败。"));
    } finally {
      setBusy("");
    }
  }

  async function confirmPrompt() {
    if (!snapshot || !currentPrompt || !promptText.trim()) return;
    setBusy("confirm");
    setError("");
    try {
      if (fixtureMode) {
        const prompts = snapshot.prompts.map((prompt) => prompt.id === currentPrompt.id
          ? { ...prompt, content: promptText.trim(), confirmed_at: new Date().toISOString() }
          : prompt);
        setSnapshot({ ...snapshot, prompts, run: { ...snapshot.run, status: "prompt_ready" } });
      } else {
        const response = await confirmImagePrompt(snapshot.run.id, {
          expected_revision: snapshot.run.revision,
          prompt_version_id: currentPrompt.id,
          content: promptText.trim(),
        }, crypto.randomUUID());
        applyRemoteSnapshot(response.data);
      }
    } catch (caught) {
      setError(errorMessage(caught, "Prompt 确认失败。"));
    } finally {
      setBusy("");
    }
  }

  async function generateCandidates() {
    if (!snapshot || !currentPrompt?.confirmed_at) {
      setError("请先确认 Prompt。");
      return;
    }
    setBusy("generate");
    setError("");
    try {
      if (fixtureMode) {
        setSnapshot({ ...snapshot, run: { ...snapshot.run, status: "generating" } });
        await new Promise((resolve) => setTimeout(resolve, 550));
        setSnapshot({ ...snapshot, candidates: fixtureCandidates(), run: { ...snapshot.run, status: "candidates_ready", aspect_ratio: aspectRatio } });
        return;
      }
      const referenceMediaId = conditioningImage ? await upload(conditioningImage.file) : undefined;
        const response = await generateImageCandidates(snapshot.run.id, {
          expected_revision: snapshot.run.revision,
        prompt_version_id: currentPrompt.id,
        aspect_ratio: aspectRatio,
        ...(referenceMediaId ? { reference_media_id: referenceMediaId } : {}),
      }, crypto.randomUUID());
      applyRemoteSnapshot(response.data);
    } catch (caught) {
      setError(errorMessage(caught, "候选图生成失败。"));
    } finally {
      setBusy("");
    }
  }

  async function startEditing() {
    if (!snapshot || !selectedCandidateId) {
      setError("请先选择一张候选图。");
      return;
    }
    setBusy("select");
    setError("");
    try {
      if (fixtureMode) {
        const selected = snapshot.candidates.find((candidate) => candidate.id === selectedCandidateId);
        if (!selected) return;
        const version: ImageVersion = {
          id: "version-0",
          version: 0,
          parent_version_id: null,
          media_id: selected.media_id,
          image_url: selected.image_url,
          instruction: null,
          provider: "midjourney",
          is_final: false,
          created_at: new Date().toISOString(),
        };
        setSelectedVersionId(version.id);
        setSnapshot({ ...snapshot, versions: [version], run: { ...snapshot.run, status: "editing", selected_candidate_id: selected.id, current_version_id: version.id } });
      } else {
        const response = await selectImageCandidate(
          snapshot.run.id,
          selectedCandidateId,
          snapshot.run.revision,
          crypto.randomUUID(),
        );
        applyRemoteSnapshot(response.data);
      }
    } catch (caught) {
      setError(errorMessage(caught, "候选图选择失败。"));
    } finally {
      setBusy("");
    }
  }

  async function editImage() {
    if (!snapshot || !currentVersion || !editInstruction.trim()) return;
    setBusy("edit");
    setError("");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const version: ImageVersion = {
          id: `version-${versions.length}`,
          version: versions.length,
          parent_version_id: currentVersion.id,
          media_id: `fixture-edit-${versions.length}`,
          image_url: SAMPLE_IMAGE,
          instruction: editInstruction.trim(),
          provider: "openai",
          is_final: false,
          created_at: new Date().toISOString(),
        };
        setSelectedVersionId(version.id);
        setSnapshot({ ...snapshot, versions: [...versions, version], run: { ...snapshot.run, current_version_id: version.id, status: "editing" } });
      } else {
        const response = await editImageVersion(snapshot.run.id, {
          expected_revision: snapshot.run.revision,
          source_version_id: currentVersion.id,
          instruction: editInstruction.trim(),
        }, crypto.randomUUID());
        applyRemoteSnapshot(response.data);
      }
      setEditInstruction("");
      setCompare(false);
    } catch (caught) {
      setError(errorMessage(caught, "图片修改失败。"));
    } finally {
      setBusy("");
    }
  }

  async function finalize() {
    if (!snapshot || !currentVersion) return;
    setBusy("finalize");
    setError("");
    try {
      if (fixtureMode) {
        const nextVersions = versions.map((version) => ({ ...version, is_final: version.id === currentVersion.id }));
        setSnapshot({ ...snapshot, versions: nextVersions, run: { ...snapshot.run, status: "finalized", final_version_id: currentVersion.id } });
      } else {
        const response = await finalizeImageVersion(
          snapshot.run.id,
          currentVersion.id,
          snapshot.run.revision,
        );
        applyRemoteSnapshot(response.data);
      }
    } catch (caught) {
      setError(errorMessage(caught, "图片定稿失败。"));
    } finally {
      setBusy("");
    }
  }

  function reset() {
    setRunQuery(null);
    setSnapshot(null);
    setPromptText("");
    setSelectedCandidateId("");
    setSelectedVersionId("");
    setEditInstruction("");
    setError("");
  }

  return (
    <div className={styles.workspace}>
      {!canWrite && <p className={styles.notice}>{blockedReason}</p>}
      {error && <p className={styles.error} role="status">{error}</p>}
      {snapshot?.run.error && <p className={styles.error} role="status">{snapshot.run.error.message}</p>}
      {failedTasks.length > 0 && <div className={styles.taskFailure} role="status">
        <div><AlertTriangle size={15} /><p><strong>{failedTasks.map((task) => TASK_LABELS[task.type as keyof typeof TASK_LABELS] ?? task.type).join("、")}失败</strong><span>自动重试已用完；手动重试不限制次数</span></p></div>
        <button className={styles.secondaryButton} type="button" disabled={busy !== "" || !canWrite} onClick={retryFailedTasks}>{busy === "retry" ? <LoaderCircle className={styles.spin} size={13} /> : <RefreshCw size={13} />}{busy === "retry" ? "重试中" : "重试失败任务"}</button>
      </div>}

      <div className={styles.flow} aria-label="生图工作流">
        {FLOW.map(([title, detail], index) => (
          <div key={title} aria-current={index === flowIndex ? "step" : undefined} className={`${styles.flowStep} ${index <= flowIndex ? styles.flowStepActive : ""}`}>
            <strong>{index + 1}. {title}</strong><small>{detail}</small>
          </div>
        ))}
      </div>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><span>01</span><div><h2>输入创意</h2><p>画面描述和竞品图片至少提供一项</p></div></div>
          {inputLocked && <button className={styles.textButton} type="button" onClick={reset}><RotateCcw size={13} />重新开始</button>}
        </header>
        <div className={styles.inputBody}>
          <div className={styles.modeGrid} aria-label="内容模式">
            {(["limited", "limitless"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={contentMode === mode} disabled={inputLocked} className={`${styles.modeChoice} ${contentMode === mode ? styles.modeActive : ""}`} onClick={() => setContentMode(mode)}>
                {contentMode === mode ? <CheckCircle2 size={16} /> : <span />}
                <strong>{mode === "limited" ? "Limited" : "Limitless"}</strong>
                <small>{mode === "limited" ? "图文提示词禁止成人向内容" : "图文提示词允许合规成人向内容"}</small>
              </button>
            ))}
          </div>
          <div className={styles.inputGrid}>
            <label className={styles.descriptionField}><span>画面描述</span><textarea disabled={inputLocked} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="主体、场景、氛围、用途；不需要先写专业 Prompt" /></label>
            <UploadField label="竞品 / 参考图片" upload={sourceImage} disabled={inputLocked} onChange={setSourceImage} />
          </div>
          <div className={styles.ownerField}><span>图片归属</span><OwnerPicker value={owner} disabled={inputLocked} onChange={setOwner} /></div>
          <div className={styles.sectionFooter}>
            <p>{contentMode === "limited" ? "Limited" : "Limitless"} 会写入 Prompt、生图与每轮修图</p>
            {!inputLocked && <button className={styles.primaryButton} type="button" disabled={busy !== "" || !canWrite || !imageRunInputReady(description, sourceImage ? 1 : 0, owner?.platformUserId ?? "")} onClick={createPrompt}>{busy === "prompt" ? <LoaderCircle className={styles.spin} size={14} /> : <Sparkles size={14} />}交给 ChatGPT</button>}
            {inputLocked && !currentPrompt && (snapshot.run.status === "prompting"
              ? <span className={styles.statusPill} data-tone="warn"><LoaderCircle className={styles.spin} size={12} />Prompt 生成中</span>
              : <button className={styles.primaryButton} type="button" disabled={busy !== "" || !canWrite} onClick={retryPrompt}>{busy === "prompt" ? <LoaderCircle className={styles.spin} size={14} /> : <RefreshCw size={14} />}重试生成 Prompt</button>)}
          </div>
        </div>
      </section>

      {currentPrompt && <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><span>02</span><div><h2>生成并确认 Prompt</h2><p>人工确认后，Midjourney 才开始生图</p></div></div>
          <span className={styles.statusPill} data-tone={currentPrompt.confirmed_at ? "good" : "warn"}>{currentPrompt.confirmed_at ? <Check size={12} /> : null}{currentPrompt.confirmed_at ? "已确认" : `Prompt v${currentPrompt.version} · 待确认`}</span>
        </header>
        <div className={styles.promptLayout}>
          <aside className={styles.analysisPanel}><strong>识别出的方向</strong>{Object.entries(currentPrompt.analysis).map(([key, value]) => value && <p key={key}>{value}</p>)}</aside>
          <div className={styles.promptEditor}>
            <label><span>Midjourney Prompt</span><textarea value={promptText} disabled={Boolean(currentPrompt.confirmed_at)} onChange={(event) => setPromptText(event.target.value)} /></label>
            {!currentPrompt.confirmed_at && <div className={styles.rewriteRow}><input aria-label="Prompt 修改要求" value={promptInstruction} onChange={(event) => setPromptInstruction(event.target.value)} placeholder="例如：更真实，少一点电影感" /><button className={styles.secondaryButton} type="button" disabled={!promptInstruction.trim() || busy !== ""} onClick={regeneratePrompt}>{busy === "prompt" ? <LoaderCircle className={styles.spin} size={13} /> : <RefreshCw size={13} />}重写</button></div>}
          </div>
        </div>
        <div className={styles.sectionFooter}><p>每次重写保留为新版本；确认后锁定当前版本</p>{!currentPrompt.confirmed_at && <button className={styles.primaryButton} type="button" disabled={!promptText.trim() || busy !== ""} onClick={confirmPrompt}>{busy === "confirm" ? <LoaderCircle className={styles.spin} size={14} /> : <Check size={14} />}确认 Prompt</button>}</div>
      </section>}

      {currentPrompt?.confirmed_at && <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><span>03</span><div><h2>生成候选图</h2><p>使用已确认 Prompt，可选垫图</p></div></div>
          {snapshot?.run.status === "generating" && <span className={styles.statusPill} data-tone="warn"><LoaderCircle className={styles.spin} size={12} />Midjourney 生成中</span>}
        </header>
        <div className={styles.generateLayout}>
          <aside className={styles.generationSettings}>
            <span>画幅</span>
            <div className={styles.aspectGrid}>{ASPECT_RATIOS.map((ratio) => <button className={aspectRatio === ratio ? styles.aspectActive : ""} aria-pressed={aspectRatio === ratio} key={ratio} type="button" disabled={(snapshot?.candidates.length ?? 0) > 0} onClick={() => setAspectRatio(ratio)}>{ratio}</button>)}</div>
            <UploadField label="可选垫图" upload={conditioningImage} disabled={(snapshot?.candidates.length ?? 0) > 0} onChange={setConditioningImage} />
            <button className={styles.primaryButton} type="button" disabled={busy !== "" || snapshot?.run.status === "generating"} onClick={generateCandidates}>{busy === "generate" || snapshot?.run.status === "generating" ? <LoaderCircle className={styles.spin} size={14} /> : <WandSparkles size={14} />}{snapshot?.candidates.length ? "重新生成 4 张" : "生成 4 张候选图"}</button>
          </aside>
          <div className={styles.candidateArea}>
            {snapshot?.candidates.length ? <div className={styles.candidateGrid}>{snapshot.candidates.map((candidate) => (
              <button key={candidate.id} type="button" aria-pressed={selectedCandidateId === candidate.id} className={`${styles.candidateCard} ${selectedCandidateId === candidate.id ? styles.candidateSelected : ""}`} onClick={() => setSelectedCandidateId(candidate.id)} aria-label={selectedCandidateId === candidate.id ? `候选图 ${candidate.ordinal}，已选择` : `选择候选图 ${candidate.ordinal}`}>
                <Image src={mediaUrl(snapshot.run.id, candidate)} alt={`候选图 ${candidate.ordinal}`} fill sizes="(max-width: 720px) 45vw, 220px" unoptimized />
                <span>{candidate.ordinal}</span>{selectedCandidateId === candidate.id && <b>已选</b>}
              </button>
            ))}</div> : <div className={styles.emptyCandidates}><ImagePlus size={24} /><strong>等待生成候选图</strong><small>任务完成后在这里选择一张进入修图</small></div>}
            {Boolean(snapshot?.candidates.length) && <div className={styles.candidateFooter}><span>已选 {selectedCandidateId ? 1 : 0} / 4</span><button className={styles.primaryButton} type="button" disabled={!selectedCandidateId || busy !== ""} onClick={startEditing}>{busy === "select" ? <LoaderCircle className={styles.spin} size={14} /> : <Check size={14} />}用选中图开始修图</button></div>}
          </div>
        </div>
      </section>}

      {currentVersion && snapshot && <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><span>04</span><div><h2>多轮修图</h2><p>每轮生成新版本，不覆盖原图</p></div></div>
          <span className={styles.statusPill} data-tone={snapshot.run.status === "finalized" ? "good" : undefined}>{snapshot.run.status === "finalized" ? "已定稿" : `当前 v${currentVersion.version}`}</span>
        </header>
        <div className={styles.editLayout}>
          <div className={`${styles.canvasGrid} ${compare && previousVersion ? styles.canvasGridCompare : ""}`}>
            {compare && previousVersion && <figure><div className={styles.canvas}><Image src={mediaUrl(snapshot.run.id, previousVersion)} alt={`修改前 v${previousVersion.version}`} fill sizes="360px" unoptimized /></div><figcaption>修改前 · v{previousVersion.version}</figcaption></figure>}
            <figure><div className={styles.canvas}><Image src={mediaUrl(snapshot.run.id, currentVersion)} alt={`当前版本 v${currentVersion.version}`} fill sizes="520px" unoptimized /></div><figcaption>当前版本 · v{currentVersion.version}</figcaption></figure>
          </div>
          <div className={styles.editPanel}>
            <label><span>本轮修图指令</span><textarea disabled={snapshot.run.status === "finalized"} value={editInstruction} onChange={(event) => setEditInstruction(event.target.value)} placeholder="保留人物和构图，加强清晨阳光；减轻疲惫感，但不要变成微笑" /></label>
            <div className={styles.quickEdits}>{["保持主体一致", "只改背景", "调整构图", "修正细节"].map((text) => <button key={text} type="button" disabled={snapshot.run.status === "finalized"} onClick={() => setEditInstruction((value) => value ? `${value}；${text}` : text)}>{text}</button>)}</div>
            <div className={styles.editActions}><button className={styles.secondaryButton} type="button" aria-pressed={compare} disabled={!previousVersion} onClick={() => setCompare((value) => !value)}><ArrowLeftRight size={13} />{compare ? "关闭对比" : "前后对比"}</button><button className={styles.primaryButton} type="button" disabled={!editInstruction.trim() || busy !== "" || snapshot.run.status === "finalized"} onClick={editImage}>{busy === "edit" ? <LoaderCircle className={styles.spin} size={14} /> : <WandSparkles size={14} />}生成新版本</button></div>
            <div className={styles.versionHistory} aria-label="修图版本历史">{versions.map((version) => <button key={version.id} type="button" aria-pressed={currentVersion.id === version.id} className={currentVersion.id === version.id ? styles.versionActive : ""} onClick={() => { setSelectedVersionId(version.id); setCompare(false); }}><strong>v{version.version}{version.is_final ? " · 最终" : ""}</strong><small>{version.instruction || "Midjourney 原图"}</small></button>)}</div>
          </div>
        </div>
        <div className={styles.finalBar}><div><strong>{snapshot.run.status === "finalized" ? `v${currentVersion.version} 已设为最终图` : "满意后结束版本链"}</strong><span>原图、Prompt 与每轮指令都会保留</span></div>{snapshot.run.status !== "finalized" && <button className={styles.primaryButton} type="button" disabled={busy !== ""} onClick={finalize}>{busy === "finalize" ? <LoaderCircle className={styles.spin} size={14} /> : <CheckCircle2 size={14} />}设为最终图</button>}</div>
      </section>}
    </div>
  );
}

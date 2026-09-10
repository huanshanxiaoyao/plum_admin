"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Globe2,
  ImagePlus,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OwnerPicker, type OwnerAccount } from "@/features/imports/owner-picker";
import {
  createRun,
  generateCandidates,
  getRun,
  preflightRun,
  retryTask,
  startRun,
  submitRun,
  updateCandidate,
} from "./api";
import { isRunPollingTerminal, type ContentMode, type FactoryRunSnapshot, type FactorySource } from "./contracts";
import {
  type BatchSourceType,
  type BatchStage,
  type LocalCandidate,
  useFactorySession,
} from "./factory-session";
import { nextBatchStage } from "./multi-lifecycle";
import {
  FACTORY_POLL_INTERVAL_MS,
  factoryPollRecoveryMessage,
  factoryPollRetryDelay,
} from "./polling";
import {
  isAcceptedSubmission,
  preflightIssueMessages,
  preflightReadyIds,
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

const FIXTURE_OWNER: OwnerAccount = {
  platformUserId: "pusr_accept_official",
  displayName: "Plum Official",
  membershipStatus: "active",
};

const IDEAS = [
  ["克制的照顾者", "少表达，多行动；关系缓慢推进"],
  ["危险的盟友", "彼此利用，在共同危机里逐渐信任"],
  ["失联的旧友", "重逢后像陌生人一样重新认识"],
  ["礼貌的对手", "竞争中保持分寸，偶尔暴露偏爱"],
  ["沉默的领航员", "只在关键时刻提供准确帮助"],
  ["逃离舞台的偶像", "对公众熟练，对亲密关系生疏"],
] as const;

const SOURCE_EVIDENCE: Readonly<Record<BatchSourceType, readonly string[]>> = {
  url_text: ["榜单角色 · 评论聚类", "热帖反馈 · 需求提炼", "来源页面 · 差异扩展"],
  text: ["主题描述 · 人物原型", "主题描述 · 冲突轴", "主题描述 · 关系差异"],
  image_text: ["示例图片 · 视觉特征", "示例图片 · 气质聚类", "文字要求 · 差异扩展"],
};

const SOURCES: readonly { type: BatchSourceType; title: string; detail: string; icon: typeof Globe2 }[] = [
  { type: "url_text", title: "竞品 / 社媒 URL", detail: "网站链接 + 需求描述，Agent 抓取提炼", icon: Globe2 },
  { type: "text", title: "纯文字描述", detail: "角色风格、主题或作品角色集合", icon: MessageSquareText },
  { type: "image_text", title: "示例图片 + 文字", detail: "解析视觉特征，文字限定参考方向", icon: ImagePlus },
];

function makeCandidates(count: number, sourceType: BatchSourceType): LocalCandidate[] {
  return Array.from({ length: count }, (_, index) => {
    const idea = IDEAS[index % IDEAS.length];
    const evidence = SOURCE_EVIDENCE[sourceType];
    return {
      id: `candidate-${String(index + 1).padStart(2, "0")}`,
      title: index < IDEAS.length ? idea[0] : `${idea[0]} ${Math.floor(index / IDEAS.length) + 1}`,
      description: idea[1],
      evidence: evidence[index % evidence.length],
      selected: true,
      status: "ready",
    };
  });
}

export function MultiConsole({ fixtureMode, canWrite, blockedReason }: Props) {
  const { multiSession, setMultiSession } = useFactorySession();
  const [contentMode, setContentMode] = useState<ContentMode>(multiSession?.contentMode ?? "limited");
  const [sourceType, setSourceType] = useState<BatchSourceType>(multiSession?.sourceType ?? "url_text");
  const [urls, setUrls] = useState(multiSession?.urls ?? "");
  const [description, setDescription] = useState(multiSession?.description ?? "");
  const [images, setImages] = useState<readonly File[]>(multiSession?.images ?? []);
  const [targetCount, setTargetCount] = useState(multiSession?.targetCount ?? 8);
  const [language, setLanguage] = useState(multiSession?.language ?? "英语");
  const [market, setMarket] = useState(multiSession?.market ?? "北美");
  const [owner, setOwner] = useState<OwnerAccount | null>(multiSession?.owner ?? (fixtureMode ? FIXTURE_OWNER : null));
  const [stage, setStage] = useState<BatchStage>(multiSession?.stage ?? "source");
  const [runId, setRunId] = useState(multiSession?.runId ?? (fixtureMode ? "fixture-batch" : ""));
  const [candidates, setCandidates] = useState<readonly LocalCandidate[]>(multiSession?.candidates ?? []);
  const [error, setError] = useState("");
  const [reason, setReason] = useState(multiSession?.reason ?? "");
  const [confirmed, setConfirmed] = useState(multiSession?.confirmed ?? false);
  const [failedTaskIds, setFailedTaskIds] = useState<readonly string[]>([]);
  const [discoveryFailure, setDiscoveryFailure] = useState("");
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [sourceUploadProgress, setSourceUploadProgress] = useState<FactoryUploadProgress | null>(null);
  const sourceUploads = useRef(new Map<File, string>());
  const sourceUploadOwner = useRef("");

  const applyRemoteSnapshot = useCallback((snapshot: FactoryRunSnapshot) => {
    const currentTasks = snapshot.tasks.filter((task) => task.is_current);
    const currentFailures = currentTasks.filter((task) => task.status === "failed");
    const next = snapshot.candidates.map((candidate) => {
      const tasks = snapshot.tasks.filter((task) => task.is_current && task.candidate_id === candidate.id);
      const active = tasks.some((task) => task.status === "queued" || task.status === "running");
      const failed = tasks.some((task) => task.status === "failed");
      const submissionAccepted = isAcceptedSubmission(candidate);
      const submissionMessage = submissionFailureMessage(candidate);
      return {
        id: candidate.id,
        title: candidate.title,
        description: candidate.description,
        evidence: candidate.evidence.map((item) => item.label).join(" · ") || "Agent 生成",
        selected: candidate.decision === "selected",
        status: submissionAccepted
          ? "submitted" as const
          : (candidate.status === "failed" && !candidate.work_id) || failed
            ? "failed" as const
            : candidate.status === "draft" && candidate.work_id
            ? "ready" as const
            : active || candidate.status === "generating"
              ? "generating" as const
              : "ready" as const,
        preflightReady: candidate.preflight?.ready ?? null,
        preflightIssues: candidate.preflight ? preflightIssueMessages(candidate) : [],
        submissionStatus: candidate.submission?.status ?? null,
        submissionMessage,
      };
    });
    setCandidates(next);
    setFailedTaskIds(currentFailures.map((task) => task.id));
    const planFinished = currentTasks.some(
      (task) => task.type === "candidate_plan" && task.status === "succeeded",
    );
    if (snapshot.run.status === "partial_failed" && !planFinished) {
      setDiscoveryFailure(currentFailures[0]?.error?.message ?? "Agent 未能完成来源拆解。");
    } else if (snapshot.run.status === "parsing" || planFinished) {
      setDiscoveryFailure("");
    }

    setStage((current) => nextBatchStage(current, snapshot));
  }, []);

  useEffect(() => {
    if (fixtureMode || !runId || (stage !== "discovering" && stage !== "generating")) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;
    async function poll() {
      try {
        const response = await getRun(runId, controller.signal);
        if (controller.signal.aborted) return;
        consecutiveFailures = 0;
        setError("");
        applyRemoteSnapshot(response.data);
        if (!isRunPollingTerminal(response.data.run.status)) {
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
            setStage((current) => current === "discovering" ? "discovery_failed" : current === "generating" ? "review" : current);
            setError(caught instanceof Error ? caught.message : "读取批次状态失败。");
          }
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [applyRemoteSnapshot, fixtureMode, runId, stage]);

  useEffect(() => {
    setMultiSession({
      contentMode,
      sourceType,
      urls,
      description,
      images,
      targetCount,
      language,
      market,
      owner,
      stage,
      runId,
      candidates,
      reason,
      confirmed,
    });
  }, [
    candidates,
    confirmed,
    contentMode,
    description,
    images,
    language,
    market,
    owner,
    reason,
    runId,
    setMultiSession,
    sourceType,
    stage,
    targetCount,
    urls,
  ]);

  const locked = stage !== "source";
  const selected = useMemo(() => candidates.filter((candidate) => candidate.selected), [candidates]);
  const completed = candidates.filter((candidate) => candidate.status === "ready" || candidate.status === "submitted").length;
  const failed = candidates.filter((candidate) => candidate.status === "failed").length;
  const running = candidates.filter((candidate) => candidate.status === "generating").length;

  function sourcePayload(): FactorySource | null {
    const text = description.trim();
    if (sourceType === "url_text") {
      const list = urls.split(/\n+/).map((item) => item.trim()).filter(Boolean);
      return list.length && text ? { type: "url_text", urls: list, description: text } : null;
    }
    if (sourceType === "text") return text ? { type: "text", description: text } : null;
    return images.length && text
      ? { type: "image_text", source_media_ids: [], description: text }
      : null;
  }

  async function discover() {
    setError("");
    setDiscoveryFailure("");
    setSourceUploadProgress(null);
    let source = sourcePayload();
    if (!source) {
      setError(sourceType === "url_text" ? "请同时填写 URL 和需求描述。" : sourceType === "image_text" ? "请同时上传示例图片并填写文字描述。" : "请填写角色风格或主题描述。");
      return;
    }
    if (!owner) {
      setError("请选择整批角色的归属账号。");
      return;
    }
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setStage("discovering");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        setRunId(`batch-${crypto.randomUUID().slice(0, 8)}`);
        setCandidates(makeCandidates(targetCount, sourceType));
        setStage("pool");
        return;
      }
      if (source.type === "image_text") {
        if (sourceUploadOwner.current !== owner.platformUserId) {
          sourceUploads.current = new Map();
          sourceUploadOwner.current = owner.platformUserId;
        }
        const uploaded = await uploadFactorySourceFiles(images, owner.platformUserId, {
          done: sourceUploads.current,
          onProgress: setSourceUploadProgress,
        });
        sourceUploads.current = new Map(uploaded.uploaded);
        if (uploaded.failures.length > 0) {
          throw new Error(`${uploaded.failures[0].file.name}：${uploaded.failures[0].message}`);
        }
        source = {
          ...source,
          source_media_ids: uploaded.mediaIds.filter((id): id is string => id !== null),
        };
        setSourceUploadProgress(null);
      }
      const created = await createRun({
        kind: "batch",
        content_mode: contentMode,
        source,
        creative_intent: description.trim(),
        language,
        market,
        owner_platform_user_id: owner.platformUserId,
        target_count: targetCount,
      }, crypto.randomUUID());
      const started = await startRun(created.data.run.id, crypto.randomUUID());
      setRunId(created.data.run.id);
      applyRemoteSnapshot(started.data);
    } catch (caught) {
      setStage("source");
      setError(caught instanceof Error ? caught.message : "启动候选拆解失败。");
    }
  }

  function patchCandidate(id: string, patch: Partial<LocalCandidate>) {
    setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate));
  }

  async function removeCandidate(id: string) {
    if (!fixtureMode) {
      try {
        await updateCandidate(runId, id, { decision: "rejected" }, crypto.randomUUID());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "删除候选失败。");
        return;
      }
    }
    setCandidates((current) => current.filter((candidate) => candidate.id !== id));
  }

  function addCandidate() {
    if (!fixtureMode) {
      setError("当前批次候选数量已冻结，可以编辑或淘汰现有候选。");
      return;
    }
    const index = candidates.length + 1;
    setCandidates((current) => [...current, { id: `candidate-${crypto.randomUUID().slice(0, 6)}`, title: `新候选 ${index}`, description: "填写这个角色与其他候选的差异。", evidence: "运营手动新增", selected: true, status: "ready" }]);
  }

  async function generate() {
    if (selected.length === 0) {
      setError("至少选择一个候选角色。");
      return;
    }
    setError("");
    try {
      if (!fixtureMode) {
        await Promise.all(selected.map((candidate) => updateCandidate(
          runId,
          candidate.id,
          {
            decision: "selected",
            title: candidate.title,
            description: candidate.description,
          },
          crypto.randomUUID(),
        )));
        const response = await generateCandidates(
          runId,
          selected.map((candidate) => candidate.id),
          crypto.randomUUID(),
        );
        applyRemoteSnapshot(response.data);
      } else {
        setStage("generating");
        setCandidates((current) => current.map((candidate, index) => candidate.selected ? { ...candidate, status: index === current.length - 1 ? "failed" : "generating" } : candidate));
        await new Promise((resolve) => setTimeout(resolve, 750));
        setCandidates((current) => current.map((candidate) => candidate.status === "generating" ? { ...candidate, status: "ready" } : candidate));
        setStage("review");
      }
    } catch (caught) {
      setStage("pool");
      setError(caught instanceof Error ? caught.message : "批量生成失败。");
    }
  }

  async function retryFailed() {
    if (retryingFailed) return;
    if (!fixtureMode) {
      if (!failedTaskIds.length) return;
      setRetryingFailed(true);
      try {
        const responses = await Promise.all(
          failedTaskIds.map((taskId) => retryTask(taskId, crypto.randomUUID())),
        );
        const latest = responses.at(-1);
        if (latest) applyRemoteSnapshot(latest.data);
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "重试失败。");
      } finally {
        setRetryingFailed(false);
      }
      return;
    }
    setCandidates((current) => current.map((candidate) => candidate.status === "failed" ? { ...candidate, status: "ready" } : candidate));
  }

  async function submit() {
    const submitIds = candidates.filter((candidate) => candidate.selected && candidate.status === "ready").map((candidate) => candidate.id);
    if (!submitIds.length) {
      setError("没有可提交的候选。");
      return;
    }
    if (!reason.trim() || !confirmed) {
      setError("请填写提交原因并确认成人内容与素材权利声明。");
      return;
    }
    try {
      if (fixtureMode) {
        setCandidates((current) => current.map((candidate) => submitIds.includes(candidate.id) ? { ...candidate, status: "submitted" } : candidate));
        setStage("submitted");
        setError("");
        return;
      }
      const preflight = await preflightRun(runId, submitIds, crypto.randomUUID());
      applyRemoteSnapshot(preflight.data);
      const readyIds = preflightReadyIds(preflight.data, submitIds);
      const blockedCount = submitIds.length - readyIds.length;
      if (!readyIds.length) {
        setError("没有候选通过投稿预检，请打开对应工作台修正后重试。");
        return;
      }
      const response = await submitRun(
        runId,
        {
          reason: reason.trim(),
          adult_confirmed: true,
          rights_confirmed: true,
          candidate_ids: readyIds,
        },
        crypto.randomUUID(),
      );
      applyRemoteSnapshot(response.data);
      const submittedCandidates = response.data.candidates.filter((candidate) => readyIds.includes(candidate.id));
      const acceptedCount = submittedCandidates.filter(isAcceptedSubmission).length;
      const submissionFailedCount = readyIds.length - acceptedCount;
      if (blockedCount || submissionFailedCount) {
        setError(`${acceptedCount} 项提交成功；${blockedCount} 项预检未通过；${submissionFailedCount} 项投稿失败。失败项已保留。`);
      } else {
        setError("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量提交失败。");
    }
  }

  return <div className={styles.workspace}>
    {!canWrite && <p className={styles.notice}><AlertTriangle size={15} />{blockedReason}</p>}
    {error && <p className={error.includes("已启动") ? styles.notice : styles.error} role="status"><AlertTriangle size={15} />{error}</p>}
    {sourceUploadProgress && <p className={styles.notice}><LoaderCircle className={styles.spin} size={15} />正在上传参考图 {sourceUploadProgress.completed} / {sourceUploadProgress.total}{sourceUploadProgress.failed ? ` · ${sourceUploadProgress.failed} 失败` : ""}</p>}

    <section className={styles.section}>
      <header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>01</span><div><h2>选择创意来源</h2><p>模式作用于整批图文；创意来源三选一</p></div></div>{locked && <span className={styles.statusPill} data-tone="good"><Check size={12} />已锁定</span>}</header>
      <div className={styles.sectionBody}>
        <div className={styles.modeGrid}>{(["limited", "limitless"] as const).map((mode) => <button key={mode} type="button" disabled={locked} className={`${styles.modeChoice} ${contentMode === mode ? (mode === "limited" ? styles.limitedActive : styles.limitlessActive) : ""}`} onClick={() => setContentMode(mode)}>{contentMode === mode ? <CheckCircle2 size={17} /> : <span />}<strong>{mode === "limited" ? "Limited" : "Limitless"}</strong><small>{mode === "limited" ? "图文提示词禁止成人向内容" : "图文提示词允许合规成人向内容"}</small></button>)}</div>
        <div className={styles.sourceGrid} style={{ marginTop: 12 }}>{SOURCES.map((source) => { const Icon = source.icon; const active = sourceType === source.type; return <button key={source.type} type="button" disabled={locked} className={`${styles.sourceChoice} ${active ? styles.sourceChoiceActive : ""}`} onClick={() => setSourceType(source.type)}><Icon size={17} /><strong>{source.title}</strong><small>{source.detail}</small></button>; })}</div>
        <div className={styles.formGrid}>
          {sourceType === "url_text" && <div className={styles.wideField}><label htmlFor="batch-urls">竞品或社媒网站 URL</label><textarea id="batch-urls" disabled={locked} value={urls} onChange={(event) => setUrls(event.target.value)} placeholder="每行一个 URL；例如竞品榜单、Reddit 板块或内容页" /></div>}
          {sourceType === "image_text" && <div className={styles.wideField}><span className={styles.label}>示例图片</span><label className={styles.dropzone}><input disabled={locked} type="file" accept="image/*" multiple onChange={(event) => setImages(Array.from(event.target.files ?? []).slice(0, 8))} /><ImagePlus size={22} /><strong>{images.length ? `已选择 ${images.length} 张图片` : "上传示例图片"}</strong><small>Agent 解析共同视觉特征，文字决定参考范围</small></label></div>}
          <div className={styles.wideField}><label htmlFor="batch-description">{sourceType === "text" ? "主题或角色风格" : "需求描述"}</label><textarea id="batch-description" disabled={locked} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={sourceType === "text" ? "例如：红楼梦中的女性角色，保留人物冲突，但改造成现代都市背景" : "说明希望提炼什么、避开什么，以及角色之间需要怎样的差异"} /></div>
          <div className={styles.field}><label htmlFor="batch-count">角色数量</label><input id="batch-count" type="number" min={1} max={20} disabled={locked} value={targetCount} onChange={(event) => setTargetCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></div>
          <div className={styles.field}><label htmlFor="batch-language">语言</label><input id="batch-language" disabled={locked} value={language} onChange={(event) => setLanguage(event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="batch-market">市场</label><input id="batch-market" disabled={locked} value={market} onChange={(event) => setMarket(event.target.value)} /></div>
          <div className={styles.wideField}><span className={styles.label}>整批归属账号</span><OwnerPicker value={owner} disabled={locked} onChange={setOwner} /></div>
        </div>
        <div className={styles.footerActions}><p>Agent 将根据来源选择抓取、主题扩展或图片理解路线</p><button className={styles.primaryButton} type="button" disabled={locked || !canWrite} onClick={discover}>{stage === "discovering" ? <LoaderCircle className={styles.spin} size={14} /> : <Sparkles size={14} />}交给 AI Agent</button></div>
      </div>
    </section>

    {(stage === "discovering" || stage === "discovery_failed") && <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>02</span><div><h2>Agent 拆解</h2><p>原料解析为统一的候选结构</p></div></div><span className={styles.statusPill} data-tone={stage === "discovery_failed" ? "bad" : "warn"}>{stage === "discovery_failed" ? <AlertTriangle size={12} /> : <LoaderCircle className={styles.spin} size={12} />}{stage === "discovery_failed" ? "拆解失败" : "解析中"}</span></header><div className={styles.sectionBody}><div className={styles.generationLanes}><div className={styles.lane}><strong>{stage === "discovering" ? <LoaderCircle className={styles.spin} size={15} /> : <AlertTriangle size={15} />}理解当前来源</strong><p>抽取人物、关系、视觉特征与用户反馈</p></div><div className={styles.lane}><strong>{stage === "discovering" ? <LoaderCircle className={styles.spin} size={15} /> : <AlertTriangle size={15} />}聚类去重</strong><p>{stage === "discovery_failed" ? discoveryFailure || "Agent 未能生成候选池。" : "输出候选图片、文字描述和来源依据"}</p></div></div>{stage === "discovery_failed" && <div className={styles.footerActions}><p>自动重试已用完；保留当前来源，可手动继续重试</p><button className={styles.secondaryButton} disabled={retryingFailed || !failedTaskIds.length || !canWrite} type="button" onClick={retryFailed}>{retryingFailed ? <LoaderCircle className={styles.spin} size={13} /> : <RefreshCw size={13} />}{retryingFailed ? "重试中" : "重试失败任务"}</button></div>}</div></section>}

    {(stage === "pool" || stage === "generating" || stage === "review" || stage === "submitted") && <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>03</span><div><h2>候选池</h2><p>先编辑、取舍和补充，再触发批量生成</p></div></div><span className={styles.statusPill}>{selected.length} / {candidates.length} 已选</span></header><div className={styles.sectionBody} style={{ overflowX: "auto" }}><table className={styles.candidateTable}><thead><tr><th>选择</th><th>候选</th><th>文字描述</th><th>来源依据</th><th>操作</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.id}><td><input type="checkbox" checked={candidate.selected} disabled={stage !== "pool"} onChange={(event) => patchCandidate(candidate.id, { selected: event.target.checked })} aria-label={`选择 ${candidate.title}`} /></td><td><input type="text" className={styles.candidateName} value={candidate.title} readOnly={stage !== "pool"} onChange={(event) => patchCandidate(candidate.id, { title: event.target.value })} /></td><td><input type="text" value={candidate.description} readOnly={stage !== "pool"} onChange={(event) => patchCandidate(candidate.id, { description: event.target.value })} /></td><td className={styles.candidateEvidence}>{candidate.evidence}</td><td><button className={styles.iconButton} type="button" disabled={stage !== "pool"} onClick={() => removeCandidate(candidate.id)} title="删除候选"><Trash2 size={13} /></button></td></tr>)}</tbody></table>{stage === "pool" && <div className={styles.footerActions}><button className={styles.secondaryButton} type="button" onClick={addCandidate}><Plus size={13} />新增候选</button><button className={styles.primaryButton} type="button" onClick={generate}><Sparkles size={14} />生成 {selected.length} 个角色</button></div>}</div></section>}

    {(stage === "generating" || stage === "review" || stage === "submitted") && <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>04</span><div><h2>批量任务</h2><p>每个候选图文并发，单项失败不阻塞整批</p></div></div><span className={styles.statusPill} data-tone={failed ? "bad" : stage === "generating" ? "warn" : "good"}>{stage === "generating" ? "生成中" : failed ? "部分失败" : "草稿"}</span></header><div className={styles.sectionBody}><div className={styles.metrics}><div className={styles.metric}><strong>{candidates.length}</strong><small>总数</small></div><div className={styles.metric}><strong>{completed}</strong><small>完成</small></div><div className={styles.metric}><strong>{running}</strong><small>生成中</small></div><div className={styles.metric}><strong>{failed}</strong><small>失败</small></div><div className={styles.metric}><strong>3</strong><small>并发上限</small></div></div><div className={styles.candidateCards} style={{ marginTop: 12 }}>{candidates.filter((candidate) => candidate.selected).map((candidate) => {
      const content = <><div className={styles.candidateVisual}><span>{candidate.title.slice(0, 1)}</span></div><div className={styles.candidateCardBody}><strong>{candidate.title}</strong><small>{candidate.status === "submitted" ? (candidate.submissionStatus === "published" ? "已发布" : "已提交 · 待审核") : candidate.submissionMessage ? `投稿失败 · ${candidate.submissionMessage}` : candidate.preflightReady === false ? `预检未通过 · ${candidate.preflightIssues?.[0] ?? "请修改草稿"}` : candidate.status === "ready" ? "图文完成 · 打开工作台" : candidate.status === "failed" ? "生成失败 · 可单独重试" : "图文生成中"}</small></div></>;
      return candidate.status === "ready" || candidate.status === "submitted"
        ? <Link key={candidate.id} className={styles.candidateCard} href={`/character-factory/multi/${encodeURIComponent(runId)}/${encodeURIComponent(candidate.id)}`}>{content}</Link>
        : <div key={candidate.id} className={`${styles.candidateCard} ${styles.candidateCardDisabled}`} aria-disabled="true">{content}</div>;
    })}</div>{failed > 0 && <div className={styles.footerActions}><p>自动重试已用完；手动重试不限制次数</p><button className={styles.secondaryButton} disabled={retryingFailed || !canWrite} type="button" onClick={retryFailed}>{retryingFailed ? <LoaderCircle className={styles.spin} size={13} /> : <RefreshCw size={13} />}{retryingFailed ? "重试中" : "仅重试失败项"}</button></div>}</div></section>}

    {(stage === "review" || stage === "submitted") && <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>05</span><div><h2>批量校验与提交</h2><p>共性问题批量处理，内容问题进入单角色工作台</p></div></div>{stage === "submitted" && <span className={styles.statusPill} data-tone="good"><CheckCircle2 size={12} />已提交</span>}</header><div className={styles.sectionBody}><div className={styles.formGrid}><div className={styles.wideField}><label htmlFor="batch-reason">提交原因</label><input id="batch-reason" disabled={stage === "submitted"} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例：北美慢热关系主题第一批" /></div><label className={`${styles.checkRow} ${styles.wideField}`}><input type="checkbox" checked={confirmed} disabled={stage === "submitted"} onChange={(event) => setConfirmed(event.target.checked)} /><span>确认角色均为成年人或无成人内容，并拥有或已取得所用素材的必要权利。</span></label></div><div className={styles.footerActions}><p>{failed ? `${completed} 项可提交，${failed} 项保留在批次中` : `${completed} 项将进入真实投稿预检`}</p><button className={styles.primaryButton} type="button" disabled={stage === "submitted"} onClick={submit}><CheckCircle2 size={14} />提交通过项</button></div></div></section>}
  </div>;
}

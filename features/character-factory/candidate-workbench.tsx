"use client";

import { FactoryCostPanel } from "./cost-panel";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { uploadPortraitFile } from "@/features/imports/import-api";
import {
  characterFactoryDraftPortraitUrl,
  createPreviewTurn,
  getDraft,
  updateDraft,
} from "./api";
import type { CharacterDraft, PreviewMessage } from "./contracts";
import { useFactorySession } from "./factory-session";
import { useAgentRevision } from "./use-agent-revision";
import { AGENT_REVISION_FIELD_LABELS } from "./agent-revision";
import { RevisionImageComparison } from "./revision-image-comparison";
import { DraftPortraitImage } from "./draft-portrait-image";
import styles from "./factory.module.css";

type Props = {
  readonly runId: string;
  readonly candidateId: string;
  readonly fixtureMode: boolean;
  readonly canWrite: boolean;
  readonly blockedReason: string;
};

const CANDIDATE_NAMES: Readonly<Record<string, string>> = {
  "candidate-01": "克制的照顾者",
  "candidate-02": "危险的盟友",
  "candidate-03": "失联的旧友",
  "candidate-04": "礼貌的对手",
  "candidate-05": "沉默的领航员",
  "candidate-06": "逃离舞台的偶像",
};

function fixtureDraft(candidateId: string, candidateName?: string): CharacterDraft {
  const name = candidateName ?? CANDIDATE_NAMES[candidateId] ?? `候选 ${candidateId.slice(-4)}`;
  return {
    candidate_id: candidateId,
    work_id: `work-${candidateId}`,
    revision: 3,
    display_name: name,
    gender: "female",
    intro: "在关系边界里保持克制，却总会留下一个位置。",
    opening_scene: "雨夜的末班车已经停运。她抬眼看了看站牌，把伞往你这边移了一点。",
    character_settings: "冷静、敏锐，习惯用具体行动表达关心。关系缓慢推进，不主动表白。",
    example_dialogues: `用户：今晚不太想回去。\n${name}：她往旁边挪了挪。‘那就等雨停。’`,
    response_rules: "回复简短；动作描写多于情绪解释；不快速建立亲密关系。",
    tag_ids: ["慢热", "都市", "陪伴"],
    creator_declared_rating: "general",
    visibility: "private",
    owner_platform_user_id: "pusr_accept_official",
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
}

export function CandidateWorkbench({ runId, candidateId, fixtureMode, canWrite, blockedReason }: Props) {
  const { multiSession, setMultiSession } = useFactorySession();
  const candidateName = multiSession?.runId === runId
    ? multiSession.candidates.find((candidate) => candidate.id === candidateId)?.title
    : undefined;
  const [draft, setDraft] = useState<CharacterDraft | null>(() => fixtureMode ? fixtureDraft(candidateId, candidateName) : null);
  const [baseline, setBaseline] = useState<CharacterDraft | null>(() => fixtureMode ? fixtureDraft(candidateId, candidateName) : null);
  const [loading, setLoading] = useState(!fixtureMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly PreviewMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (fixtureMode) return;
    const controller = new AbortController();
    let active = true;
    getDraft(candidateId, controller.signal)
      .then((response) => {
        if (!active) return;
        setDraft(response.data);
        setBaseline(response.data);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "读取草稿失败。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [candidateId, fixtureMode]);

  useEffect(() => {
    if (!baseline) return;
    setMultiSession((current) => current?.runId === runId
      ? { ...current, candidates: current.candidates.map((candidate) => candidate.id === candidateId
        ? { ...candidate, draftRevision: baseline.revision }
        : candidate) }
      : current);
  }, [baseline, candidateId, runId, setMultiSession]);

  const dirty = draft !== null && baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
  const displayedPortraitUrl = portraitUrl ?? (
    !fixtureMode && draft
      ? characterFactoryDraftPortraitUrl(draft.candidate_id, draft.revision)
      : null
  );
  const onAgentDraftUpdated = useCallback((next: CharacterDraft) => {
    if (draft?.portrait_media_id !== next.portrait_media_id) setPortraitUrl(null);
    setDraft(next);
    setBaseline(next);
    setHistory([]);
    setMultiSession((current) => current?.runId === runId
      ? { ...current, candidates: current.candidates.map((candidate) => candidate.id === candidateId ? { ...candidate, title: next.display_name } : candidate) }
      : current);
  }, [candidateId, draft?.portrait_media_id, runId, setMultiSession]);
  const revision = useAgentRevision({
    runId,
    candidateId,
    fixtureMode,
    canWrite,
    blockedReason,
    draft,
    baseline,
    dirty,
    onDraftUpdated: onAgentDraftUpdated,
    setError,
  });

  function update<K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!draft || !baseline) {
      setError("真实角色草稿尚未加载，无法保存。");
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
        setMultiSession((current) => current?.runId === runId
          ? { ...current, candidates: current.candidates.map((candidate) => candidate.id === candidateId ? { ...candidate, title: saved.display_name } : candidate) }
          : current);
      } else {
        const response = await updateDraft(candidateId, baseline.revision, draft, crypto.randomUUID());
        setDraft(response.data);
        setBaseline(response.data);
        setMultiSession((current) => current?.runId === runId
          ? { ...current, candidates: current.candidates.map((candidate) => candidate.id === candidateId ? { ...candidate, title: response.data.display_name } : candidate) }
          : current);
      }
      setHistory([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存草稿失败。");
    } finally {
      setSaving(false);
    }
  }

  async function replacePortrait(files: FileList | null) {
    const file = files?.[0];
    if (!file || saving || !draft || !baseline) return;
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (fixtureMode) {
        update("portrait_media_id", `fixture:${file.name}`);
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
          candidateId,
          baseline.revision,
          next,
          crypto.randomUUID(),
        );
        setDraft(response.data);
        setBaseline(response.data);
      }
      setPortraitUrl(URL.createObjectURL(file));
      setHistory([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "角色图片上传失败。");
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || testing) return;
    if (!draft) {
      setError("真实角色草稿尚未加载，无法测试对话。");
      return;
    }
    if (dirty) {
      setError("请先保存草稿，再测试最新角色效果。");
      return;
    }
    const nextHistory: readonly PreviewMessage[] = [...history, { role: "user", content: message }];
    setHistory(nextHistory);
    setChatInput("");
    setTesting(true);
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        setHistory([...nextHistory, { role: "assistant", content: "她把伞往你这边移了移。‘先走到有灯的地方。’" }]);
      } else {
        const response = await createPreviewTurn(candidateId, { expected_revision: draft.revision, message, history }, crypto.randomUUID());
        setHistory([...nextHistory, {
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

  if (loading) return <div className={styles.notice}><LoaderCircle className={styles.spin} size={15} />正在读取角色草稿</div>;

  if (!draft || !baseline) return <div className={styles.workspace}>
    <div className={styles.workbenchTop}><Link href="/character-factory/multi"><ArrowLeft size={14} />返回多角色批次</Link><span className={styles.statusPill} data-tone="bad">草稿不可用</span></div>
    <p className={styles.error} role="status"><AlertTriangle size={15} />{error || "后端未返回角色草稿。"}</p>
  </div>;

  return <div className={styles.workspace}>
    <div className={styles.workbenchTop}><Link href="/character-factory/multi"><ArrowLeft size={14} />返回多角色批次</Link><span className={styles.statusPill} data-tone={dirty ? "warn" : "good"}>{dirty ? "有未保存修改" : `已保存 · 草稿 v${draft.revision}`}</span></div>
    <div className={styles.workbenchTitle}><h2>{draft.display_name} · 角色工作台</h2><code>{runId} / {candidateId}</code></div>
    {!canWrite && <p className={styles.notice}><AlertTriangle size={15} />{blockedReason}</p>}
    {error && <p className={styles.error} role="status"><AlertTriangle size={15} />{error}</p>}
    {saving && <p className={styles.notice}><LoaderCircle className={styles.spin} size={15} />正在保存角色草稿</p>}

    <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>03</span><div><h2>当前角色草稿</h2><p>此处与候选关联的真实投稿草稿是同一份数据</p></div></div></header><div className={styles.sectionBody}><div className={styles.draftGrid}><div className={styles.portraitPanel}><div className={styles.portrait}><DraftPortraitImage src={displayedPortraitUrl} displayName={draft.display_name} emptyLabel="角色立绘 · 9:16" /></div><div className={styles.inlineActions}><label className={styles.secondaryButton}><Upload size={13} />上传替换<input className={styles.srOnly} type="file" accept="image/*" onChange={(event) => replacePortrait(event.target.files)} /></label><button className={styles.secondaryButton} type="button" onClick={() => revision.changeMode("image")}><RefreshCw size={13} />重新生成</button></div></div><div className={styles.formGrid}><div className={styles.field}><label>名称</label><input value={draft.display_name} onChange={(event) => update("display_name", event.target.value)} /></div><div className={styles.field}><label>性别</label><select value={draft.gender} onChange={(event) => update("gender", event.target.value as CharacterDraft["gender"])}><option value="female">女</option><option value="male">男</option><option value="non_binary">非二元</option></select></div><div className={styles.wideField}><label>简介</label><input value={draft.intro} onChange={(event) => update("intro", event.target.value)} /></div><div className={styles.wideField}><label>开场场景</label><textarea value={draft.opening_scene} onChange={(event) => update("opening_scene", event.target.value)} /></div><div className={`${styles.wideField} ${styles.tall}`}><label>角色设定</label><textarea value={draft.character_settings} onChange={(event) => update("character_settings", event.target.value)} /></div><div className={styles.wideField}><label>示例对话</label><textarea value={draft.example_dialogues} onChange={(event) => update("example_dialogues", event.target.value)} /></div><div className={styles.wideField}><label>回复规则</label><textarea value={draft.response_rules} onChange={(event) => update("response_rules", event.target.value)} /></div><div className={styles.field}><label>标签 ID</label><input value={draft.tag_ids.join(", ")} onChange={(event) => update("tag_ids", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></div><div className={styles.field}><label>内容评级</label><select value={draft.creator_declared_rating} onChange={(event) => update("creator_declared_rating", event.target.value as CharacterDraft["creator_declared_rating"])}><option value="general">一般级</option><option value="mature">成人级</option></select></div><div className={styles.field}><label>可见性</label><select value={draft.visibility} onChange={(event) => update("visibility", event.target.value as CharacterDraft["visibility"])}><option value="private">私密</option><option value="public">公开</option></select></div><div className={styles.field}><label>归属账号</label><input value={draft.owner_platform_user_id} readOnly /></div></div></div><div className={styles.footerActions}><button className={styles.ghostButton} disabled={!dirty} type="button" onClick={() => setDraft(baseline)}>撤销手动修改</button><button className={styles.primaryButton} disabled={!dirty || saving || !canWrite} type="button" onClick={save}>{saving ? <LoaderCircle className={styles.spin} size={14} /> : <Check size={14} />}保存草稿</button></div></div></section>

    <div className={styles.parallelGrid}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><span className={styles.sectionIndex}>04</span><div><h3>描述修改</h3><p>Agent 修改先生成预览，应用后才写入草稿</p></div></div>
        </header>
        <div className={styles.sectionBody}>
          <div className={styles.segmented}>
            <button disabled={revision.busy || revision.applying} className={revision.mode === "text" ? styles.segmentActive : ""} type="button" onClick={() => revision.changeMode("text")}>改文字</button>
            <button disabled={revision.busy || revision.applying} className={revision.mode === "image" ? styles.segmentActive : ""} type="button" onClick={() => revision.changeMode("image")}>改图片</button>
          </div>
          <textarea disabled={revision.busy || revision.applying} className={styles.promptInput} value={revision.instruction} onChange={(event) => revision.setInstruction(event.target.value)} placeholder={revision.mode === "text" ? "描述希望修改的设定、语气或对话方式" : "描述画面变化和必须保持的部分"} />
          {revision.unavailableMessage && <p className={styles.notice} role="status"><AlertTriangle size={14} />{revision.unavailableMessage}</p>}
          <button className={styles.primaryButton} disabled={!revision.instruction.trim() || revision.busy || revision.applying || !canWrite} type="button" onClick={revision.generatePreview}>
            {revision.busy ? <LoaderCircle className={styles.spin} size={13} /> : <Sparkles size={13} />}
            {revision.busy ? "Agent 修改中" : "生成修改预览"}
          </button>
          {revision.preview && <div className={styles.revisionPreview}>
            <strong>{revision.mode === "text" ? "文字修改预览" : "图片修改预览"} · 基于草稿 v{revision.preview.expected_revision}</strong>
            {"changes" in revision.preview ? <div className={styles.revisionChanges}>
              {revision.preview.changes.map((change) => <div className={styles.revisionChange} key={change.field}>
                <b>{AGENT_REVISION_FIELD_LABELS[change.field]}</b>
                <div><small>修改前</small><p>{change.before || "（空）"}</p></div>
                <div><small>修改后</small><p>{change.after || "（空）"}</p></div>
              </div>)}
            </div> : <RevisionImageComparison
              candidateId={candidateId}
              taskId={revision.previewTaskId}
              fixtureMode={fixtureMode}
            />}
            <div className={styles.inlineActions}>
              <button className={styles.ghostButton} disabled={revision.applying} type="button" onClick={revision.dismissPreview}>撤销</button>
              <button className={styles.primaryButton} disabled={revision.applying || !canWrite} type="button" onClick={revision.applyPreview}>{revision.applying ? <LoaderCircle className={styles.spin} size={13} /> : <Check size={13} />}应用修改</button>
            </div>
          </div>}
        </div>
      </section>
      <section className={styles.section}><header className={styles.sectionHeader}><div className={styles.sectionTitle}><span className={styles.sectionIndex}>05</span><div><h3>对话测试</h3><p>固定读取草稿 v{draft.revision}，不产生线上消息</p></div></div><button className={styles.ghostButton} type="button" onClick={() => setHistory([])}>重新开始</button></header><div className={styles.sectionBody}><div className={styles.chat}>{history.length === 0 && <div className={styles.message}><small>{draft.display_name} · 草稿 v{draft.revision}</small>雨越来越大了。你要去哪？</div>}{history.map((message, index) => <div key={`${message.role}-${index}`} className={`${styles.message} ${message.role === "user" ? styles.userMessage : ""}`}><small>{message.role === "user" ? "模拟用户" : draft.display_name}</small>{message.content}</div>)}{testing && <div className={styles.message}><small>{draft.display_name}</small><LoaderCircle className={styles.spin} size={13} /></div>}</div><form className={styles.chatForm} onSubmit={sendMessage}><input className={styles.chatInput} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="输入下一句" aria-label="输入测试消息" /><button type="submit" disabled={testing} aria-label="发送"><Send size={14} /></button></form></div></section>
    </div>
    <FactoryCostPanel runId={runId} candidateId={candidateId} candidates={[{ id: candidateId, title: draft.display_name }]} active={revision.busy || testing} refreshKey={`${revision.previewTaskId}-${testing}`} />
  </div>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FactoryApiError,
  applyAgentRevision,
  createAgentRevision,
  getDraft,
  getRun,
} from "./api";
import { resolveAgentRevisionTask } from "./agent-revision";
import {
  FACTORY_POLL_INTERVAL_MS,
  factoryPollRecoveryMessage,
  factoryPollRetryDelay,
} from "./polling";
import type {
  AgentRevisionPreview,
  AgentRevisionTextField,
  CharacterDraft,
  FactoryTask,
} from "./contracts";

const REVISION_FIELDS: readonly AgentRevisionTextField[] = [
  "display_name",
  "intro",
  "opening_scene",
  "character_settings",
  "example_dialogues",
  "response_rules",
];

type RevisionMode = "text" | "image";

type Options = {
  readonly runId: string;
  readonly candidateId: string;
  readonly fixtureMode: boolean;
  readonly canWrite: boolean;
  readonly blockedReason: string;
  readonly draft: CharacterDraft | null;
  readonly baseline: CharacterDraft | null;
  readonly dirty: boolean;
  readonly onDraftUpdated: (draft: CharacterDraft) => void;
  readonly setError: (message: string) => void;
};

export function useAgentRevision(options: Options) {
  const {
    runId,
    candidateId,
    fixtureMode,
    canWrite,
    blockedReason,
    draft,
    baseline,
    dirty,
    onDraftUpdated,
    setError,
  } = options;
  const [mode, setMode] = useState<RevisionMode>("text");
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<AgentRevisionPreview | null>(null);
  const [runningTaskId, setRunningTaskId] = useState("");
  const [previewTaskId, setPreviewTaskId] = useState("");
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState("");

  const finishTask = useCallback((task: FactoryTask) => {
    const resolution = resolveAgentRevisionTask(task, mode);
    if (resolution.type === "wait") return;
    setRunningTaskId("");
    if (resolution.type === "preview") {
      setPreview(resolution.preview);
      setPreviewTaskId(task.id);
      setUnavailableMessage("");
      setError("");
      return;
    }
    setPreview(null);
    setPreviewTaskId("");
    if (resolution.unavailable) setUnavailableMessage(resolution.message);
    else setError(resolution.message);
  }, [mode, setError]);

  useEffect(() => {
    if (fixtureMode || !runningTaskId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;

    async function poll() {
      try {
        const response = await getRun(runId, controller.signal);
        if (controller.signal.aborted) return;
        consecutiveFailures = 0;
        setError("");
        const task = response.data.tasks.find((item) => item.id === runningTaskId);
        if (!task || task.status === "queued" || task.status === "running") {
          timer = setTimeout(poll, FACTORY_POLL_INTERVAL_MS);
          return;
        }
        finishTask(task);
      } catch (caught) {
        if (!controller.signal.aborted) {
          consecutiveFailures += 1;
          const retryDelay = factoryPollRetryDelay(caught, consecutiveFailures);
          if (retryDelay !== null) {
            setError(factoryPollRecoveryMessage(consecutiveFailures));
            timer = setTimeout(poll, retryDelay);
          } else {
            setRunningTaskId("");
            setError(caught instanceof Error ? caught.message : "读取 Agent 修改结果失败。");
          }
        }
      }
    }

    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [finishTask, fixtureMode, runId, runningTaskId, setError]);

  const refreshAfterConflict = useCallback(async (message: string) => {
    try {
      const response = await getDraft(candidateId);
      onDraftUpdated(response.data);
      setPreview(null);
      setPreviewTaskId("");
      setError(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "草稿版本冲突，刷新失败。");
    }
  }, [candidateId, onDraftUpdated, setError]);

  async function generatePreview() {
    if (!instruction.trim() || starting || runningTaskId) return;
    if (!draft || !baseline || !candidateId || !runId) {
      setError("真实角色草稿尚未加载，无法生成修改预览。");
      return;
    }
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    if (dirty) {
      setError("请先保存或撤销手动修改，再让 Agent 基于最新草稿生成预览。");
      return;
    }
    setStarting(true);
    setPreview(null);
    setPreviewTaskId("");
    setUnavailableMessage("");
    setError("");
    try {
      if (fixtureMode) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (mode === "text") {
          const field = "character_settings" as const;
          setPreview({
            expected_revision: draft.revision,
            changes: [{
              field,
              before: draft[field],
              after: `${draft[field].replace(/[。！？!?；;\s]+$/, "")}；${instruction.trim()}。`,
            }],
          });
        } else {
          const before = {
            portrait_media_id: draft.portrait_media_id,
            image_set_id: draft.image_set_id,
            portrait_crop: draft.portrait_crop,
            avatar_crop: draft.avatar_crop,
            portrait_position_x: draft.portrait_position_x,
            portrait_position_y: draft.portrait_position_y,
            portrait_zoom: draft.portrait_zoom,
            avatar_position_x: draft.avatar_position_x,
            avatar_position_y: draft.avatar_position_y,
            avatar_zoom: draft.avatar_zoom,
          };
          setPreview({
            expected_revision: draft.revision,
            image_change: {
              before,
              after: {
                ...before,
                portrait_media_id: `fixture-revision:${crypto.randomUUID()}`,
                image_set_id: `fixture-image-set:${crypto.randomUUID()}`,
              },
            },
          });
        }
        setPreviewTaskId(`fixture-revision-${crypto.randomUUID()}`);
        return;
      }
      const response = await createAgentRevision(
        candidateId,
        {
          kind: mode,
          instruction: instruction.trim(),
          expected_revision: baseline.revision,
          ...(mode === "text" ? { fields: REVISION_FIELDS } : {}),
        },
        crypto.randomUUID(),
      );
      const resolution = resolveAgentRevisionTask(response.data, mode);
      if (resolution.type === "wait") setRunningTaskId(response.data.id);
      else finishTask(response.data);
    } catch (caught) {
      if (caught instanceof FactoryApiError && caught.status === 409) {
        await refreshAfterConflict("草稿已被其他操作更新，已刷新到最新版本，请重新生成预览。");
      } else if (mode === "image" && caught instanceof FactoryApiError &&
        caught.code === "image_provider_unavailable") {
        setUnavailableMessage("图片修改服务当前不可用，可使用上传替换。");
      } else {
        setError(caught instanceof Error ? caught.message : "启动 Agent 修改失败。");
      }
    } finally {
      setStarting(false);
    }
  }

  async function applyPreview() {
    if (!draft || !baseline || !preview || !previewTaskId || applying) return;
    if (!canWrite) {
      setError(blockedReason);
      return;
    }
    setApplying(true);
    setError("");
    try {
      if (fixtureMode) {
        const changes = "changes" in preview
          ? Object.fromEntries(preview.changes.map((change) => [change.field, change.after]))
          : preview.image_change.after;
        onDraftUpdated({
          ...draft,
          ...changes,
          revision: draft.revision + 1,
          updated_at: new Date().toISOString(),
        } as CharacterDraft);
      } else {
        const response = await applyAgentRevision(
          candidateId,
          previewTaskId,
          preview.expected_revision,
          crypto.randomUUID(),
        );
        onDraftUpdated(response.data);
      }
      setPreview(null);
      setPreviewTaskId("");
    } catch (caught) {
      if (caught instanceof FactoryApiError && caught.status === 409) {
        await refreshAfterConflict("草稿已被其他操作更新，Agent 预览未应用；已刷新到最新版本。");
      } else {
        setError(caught instanceof Error ? caught.message : "应用 Agent 修改失败。");
      }
    } finally {
      setApplying(false);
    }
  }

  function changeMode(next: RevisionMode) {
    if (starting || runningTaskId || applying) return;
    setMode(next);
    setInstruction("");
    setPreview(null);
    setPreviewTaskId("");
    setUnavailableMessage("");
    setError("");
  }

  function dismissPreview() {
    setPreview(null);
    setPreviewTaskId("");
  }

  return {
    mode,
    instruction,
    setInstruction,
    preview,
    previewTaskId,
    busy: starting || runningTaskId.length > 0,
    applying,
    unavailableMessage,
    changeMode,
    generatePreview,
    applyPreview,
    dismissPreview,
  } as const;
}

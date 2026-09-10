import {
  AGENT_REVISION_TEXT_FIELDS,
  type AgentRevisionChange,
  type AgentRevisionImageState,
  type AgentRevisionPreview,
  type CropRect,
  type FactoryTask,
} from "./contracts.ts";

const TEXT_FIELDS = new Set<string>(AGENT_REVISION_TEXT_FIELDS);

export const AGENT_REVISION_FIELD_LABELS: Readonly<Record<
  AgentRevisionChange["field"],
  string
>> = {
  display_name: "名称",
  intro: "简介",
  opening_scene: "开场场景",
  character_settings: "角色设定",
  example_dialogues: "示例对话",
  response_rules: "回复规则",
};

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

const IMAGE_FIELDS = [
  "portrait_media_id",
  "image_set_id",
  "portrait_crop",
  "avatar_crop",
  "portrait_position_x",
  "portrait_position_y",
  "portrait_zoom",
  "avatar_position_x",
  "avatar_position_y",
  "avatar_zoom",
] as const;

function crop(value: unknown): CropRect | null | undefined {
  if (value === null) return null;
  const item = record(value);
  if (!item || item.contract_version !== 2) return undefined;
  const keys = ["x", "y", "width", "height"] as const;
  if (keys.some((key) => typeof item[key] !== "number" || !Number.isFinite(item[key]))) {
    return undefined;
  }
  return {
    contract_version: 2,
    x: item.x as number,
    y: item.y as number,
    width: item.width as number,
    height: item.height as number,
  };
}

function imageState(value: unknown): AgentRevisionImageState | null {
  const item = record(value);
  if (!item || Object.keys(item).some((key) => !IMAGE_FIELDS.includes(key as typeof IMAGE_FIELDS[number])) ||
    IMAGE_FIELDS.some((key) => !(key in item))) return null;
  const portraitCrop = crop(item.portrait_crop);
  const avatarCrop = crop(item.avatar_crop);
  const numeric = [
    "portrait_position_x",
    "portrait_position_y",
    "portrait_zoom",
    "avatar_position_x",
    "avatar_position_y",
    "avatar_zoom",
  ] as const;
  if (typeof item.portrait_media_id !== "string" || !item.portrait_media_id ||
    typeof item.image_set_id !== "string" || !item.image_set_id ||
    portraitCrop === undefined || avatarCrop === undefined ||
    numeric.some((key) => typeof item[key] !== "number" || !Number.isFinite(item[key]))) return null;
  return {
    portrait_media_id: item.portrait_media_id,
    image_set_id: item.image_set_id,
    portrait_crop: portraitCrop,
    avatar_crop: avatarCrop,
    portrait_position_x: item.portrait_position_x as number,
    portrait_position_y: item.portrait_position_y as number,
    portrait_zoom: item.portrait_zoom as number,
    avatar_position_x: item.avatar_position_x as number,
    avatar_position_y: item.avatar_position_y as number,
    avatar_zoom: item.avatar_zoom as number,
  };
}

/** Task output is an open JSON object, so validate the preview before rendering it. */
export function readAgentRevisionPreview(
  output: Readonly<Record<string, unknown>>,
): AgentRevisionPreview | null {
  const preview = record(output.revision_preview);
  if (!preview || !Number.isInteger(preview.expected_revision) ||
    Number(preview.expected_revision) < 1) return null;

  const imageChange = record(preview.image_change);
  if (imageChange) {
    const before = imageState(imageChange.before);
    const after = imageState(imageChange.after);
    if (!before || !after || JSON.stringify(before) === JSON.stringify(after)) return null;
    return {
      expected_revision: Number(preview.expected_revision),
      image_change: { before, after },
    };
  }
  if (!Array.isArray(preview.changes) || preview.changes.length === 0) return null;

  const seen = new Set<string>();
  const changes = preview.changes.flatMap((value) => {
    const change = record(value);
    const field = change?.field;
    if (!change || typeof field !== "string" || !TEXT_FIELDS.has(field) || seen.has(field) ||
      typeof change.before !== "string" || typeof change.after !== "string") return [];
    seen.add(field);
    return [{
      field: field as AgentRevisionChange["field"],
      before: change.before,
      after: change.after,
    }];
  });
  if (changes.length !== preview.changes.length) return null;
  return { expected_revision: Number(preview.expected_revision), changes };
}

export type AgentRevisionTaskResolution =
  | { readonly type: "wait" }
  | { readonly type: "preview"; readonly preview: AgentRevisionPreview }
  | { readonly type: "failed"; readonly message: string; readonly unavailable: boolean };

export function resolveAgentRevisionTask(
  task: FactoryTask,
  kind: "text" | "image",
): AgentRevisionTaskResolution {
  if (task.status === "queued" || task.status === "running") return { type: "wait" };
  if (task.status === "succeeded") {
    const preview = readAgentRevisionPreview(task.output);
    return preview
      ? { type: "preview", preview }
      : { type: "failed", message: "Agent 返回的修改预览格式不完整。", unavailable: false };
  }
  const code = task.error?.code ?? (task.status === "cancelled" ? "task_cancelled" : "task_failed");
  if (kind === "image" && code === "image_provider_unavailable") {
    return {
      type: "failed",
      message: "图片修改服务当前不可用，可使用上传替换。",
      unavailable: true,
    };
  }
  return {
    type: "failed",
    message: `Agent 修改失败（${code}）。`,
    unavailable: false,
  };
}

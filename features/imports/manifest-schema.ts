/**
 * manifest 的字段定义。这是打包规范（PRD §7）在代码里的唯一副本，校验、模板下载和
 * 后台的规范说明页都从这里取，避免三处各写一份然后慢慢漂移。
 *
 * 字符上限只是第一道闸；真正会触发拒绝的是服务端的 token 预算，由 preflight 返回，
 * 不在这里估算——那套分块预算是服务端策略，复制过来必然漂移。
 */

export const MANIFEST_FORMATS = ["csv", "jsonl"] as const;
export type ManifestFormat = (typeof MANIFEST_FORMATS)[number];

export const GENDERS = ["male", "female", "non_binary"] as const;
export const RATINGS = ["general", "mature"] as const;
export const VISIBILITIES = ["public", "private"] as const;

export type ManifestField = {
  readonly name: string;
  /** 列头是否必须出现在表格里。 */
  readonly columnRequired: boolean;
  /** 每一行是否必须有非空值。`portrait_file` 是条件必填，单独判定。 */
  readonly valueRequired: boolean;
  readonly maxLength?: number;
  readonly enumValues?: readonly string[];
  readonly label: string;
};

export const MANIFEST_FIELDS: readonly ManifestField[] = [
  { name: "row_key", columnRequired: true, valueRequired: true, maxLength: 64, label: "行标识" },
  { name: "display_name", columnRequired: true, valueRequired: true, maxLength: 50, label: "角色名" },
  {
    name: "gender",
    columnRequired: true,
    valueRequired: true,
    enumValues: GENDERS,
    label: "性别",
  },
  { name: "intro", columnRequired: true, valueRequired: true, maxLength: 10_000, label: "简介" },
  {
    name: "opening_scene",
    columnRequired: true,
    valueRequired: true,
    maxLength: 10_000,
    label: "开场场景",
  },
  {
    name: "character_settings",
    columnRequired: true,
    valueRequired: true,
    maxLength: 20_000,
    label: "角色设定",
  },
  {
    name: "creator_declared_rating",
    columnRequired: true,
    valueRequired: true,
    enumValues: RATINGS,
    label: "内容评级",
  },
  // 新建必填、更新可留空（沿用原图），所以这里不设 valueRequired，由行级规则判定。
  {
    name: "portrait_file",
    columnRequired: true,
    valueRequired: false,
    maxLength: 255,
    label: "立绘文件",
  },
  {
    name: "owner_platform_user_id",
    columnRequired: false,
    valueRequired: false,
    maxLength: 100,
    label: "归属账号",
  },
  { name: "character_id", columnRequired: false, valueRequired: false, maxLength: 100, label: "角色 ID" },
  {
    name: "example_dialogues",
    columnRequired: false,
    valueRequired: false,
    maxLength: 10_000,
    label: "示例对话",
  },
  {
    name: "response_rules",
    columnRequired: false,
    valueRequired: false,
    maxLength: 6_000,
    label: "回复规则",
  },
  { name: "tag_ids", columnRequired: false, valueRequired: false, label: "标签" },
  {
    name: "visibility",
    columnRequired: false,
    valueRequired: false,
    enumValues: VISIBILITIES,
    label: "可见性",
  },
  { name: "portrait_crop", columnRequired: false, valueRequired: false, label: "立绘裁剪" },
  { name: "avatar_crop", columnRequired: false, valueRequired: false, label: "头像裁剪" },
  { name: "note", columnRequired: false, valueRequired: false, maxLength: 500, label: "备注" },
];

export const MANIFEST_FIELD_NAMES: readonly string[] = MANIFEST_FIELDS.map((field) => field.name);

export function manifestField(name: string): ManifestField | undefined {
  return MANIFEST_FIELDS.find((field) => field.name === name);
}

/**
 * 由系统决定、包里不允许出现的列。静默忽略会让运营以为自己的设置生效了，所以一律报错。
 */
export const FORBIDDEN_COLUMNS: readonly string[] = [
  "work_id",
  "status",
  "content_version",
  "prompt_version",
  "published_at",
  "stats",
  "heat",
  "sort_order",
  "source",
  "owner_kind",
];

export const FORBIDDEN_COLUMN_PREFIXES: readonly string[] = ["moderation_", "review_", "stats_"];

export function isForbiddenColumn(name: string): boolean {
  return (
    FORBIDDEN_COLUMNS.includes(name) ||
    FORBIDDEN_COLUMN_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

export const MANIFEST_BASENAME = "manifest";
export const IMAGES_DIRECTORY = "images/";

export const MAX_ROWS_PER_PACKAGE = 100;
export const MAX_PACKAGE_BYTES = 600 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TAGS_PER_CHARACTER = 10;

export const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * 压缩工具自动塞进来的系统文件。这些不是运营放的，报成错误会让每个用 macOS
 * 打包的人都卡住；但也不能完全不出声，所以按提示（notice）报出来。
 */
export function isOperatingSystemArtifact(path: string): boolean {
  if (path.startsWith("__MACOSX/")) return true;
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return basename === ".DS_Store" || basename === "Thumbs.db" || basename === "desktop.ini";
}

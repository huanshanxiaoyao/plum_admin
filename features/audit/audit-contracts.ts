/**
 * 操作审计的类型与解析，**全部取自生成契约**。
 *
 * 审计是「谁动过什么」的账本：写开关放开之后，不可逆的处置（`purge`）与批量写同时
 * 可用，这一页就是唯一能在控制台里回看的地方。因此解析比展示更重要——形状不对宁可
 * 整页报错，也不要展示一份看起来正常、实则缺字段的账本。
 */

import type { components as AdminApiComponents } from "../../contracts/generated/admin-api.ts";
import { FILTERABLE_ACTIONS } from "./labels.ts";

type Schemas = AdminApiComponents["schemas"];

export type AuditEvent = Schemas["AdminAuditEventItem"];
export type AuditEventListResponse = Schemas["AdminAuditEventListResponse"];
export type PageInfo = Schemas["PageInfo"];

/**
 * 后端写审计时就约束了「只写标识、状态与字段名」，这里再挡一道。
 * 真漏了正文是写入侧的 bug，必须在写入侧修；前端这道闸门是让它**立刻可见**，
 * 而不是安静地把角色正文渲染到审计页上。
 */
const FORBIDDEN_METADATA_KEYS = [
  "prompt",
  "prompt_text",
  "intro",
  "greeting",
  "content",
  "content_json",
  "opening_scene",
  "character_settings",
  "example_dialogues",
  "response_rules",
  "token",
  "access_token",
  "cookie",
] as const;

export type AuditListQuery = {
  readonly actor?: string;
  readonly action?: string;
  readonly plaintext?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

export function containsForbiddenMetadata(metadata: Record<string, unknown>): boolean {
  return FORBIDDEN_METADATA_KEYS.some((key) => key in metadata);
}

export function isAuditEvent(value: unknown): value is AuditEvent {
  if (!isRecord(value)) return false;
  const metadata = value.metadata === undefined ? {} : value.metadata;
  if (!isRecord(metadata) || containsForbiddenMetadata(metadata)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.occurred_at === "string" &&
    typeof value.actor_open_id === "string" &&
    isNullableString(value.actor_display_name) &&
    typeof value.action === "string" &&
    typeof value.resource_type === "string" &&
    isNullableString(value.resource_id) &&
    typeof value.plaintext === "boolean" &&
    isNullableString(value.reason) &&
    isNullableString(value.request_path)
  );
}

function isPageInfo(value: unknown): value is PageInfo {
  return (
    isRecord(value) &&
    typeof value.limit === "number" &&
    typeof value.has_more === "boolean" &&
    isNullableString(value.next_cursor)
  );
}

export function parseAuditEventListResponse(value: unknown): AuditEventListResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(isAuditEvent) ||
    !isPageInfo(value.page) ||
    !isRecord(value.meta) ||
    typeof value.meta.request_id !== "string"
  ) {
    throw new TypeError("Invalid audit event list response payload");
  }
  return value as AuditEventListResponse;
}

function clean(value: string | undefined, maxLength: number): string | undefined {
  return value?.trim().slice(0, maxLength) || undefined;
}

/**
 * `action` 只放行已知动作。后端按前缀校验，随便传会 400——把一个手敲坏的 URL 变成
 * 整页报错没有意义，降级成「不筛选」仍然能看到全部事件。
 */
export function normalizeAuditQuery(query: AuditListQuery): AuditListQuery {
  const action = clean(query.action, 120);
  return {
    actor: clean(query.actor, 128),
    action: FILTERABLE_ACTIONS.includes(action as (typeof FILTERABLE_ACTIONS)[number])
      ? action
      : undefined,
    plaintext: query.plaintext,
    limit: Number.isInteger(query.limit) ? Math.min(200, Math.max(1, query.limit ?? 50)) : 50,
    cursor: clean(query.cursor, 2048),
  };
}

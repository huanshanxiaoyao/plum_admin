/**
 * 审计的**服务端**取数。
 *
 * 走 `adminApiGet`（带 BFF 令牌的直连），因为审计页是 Server Component；浏览器侧的
 * `adminApiFetch` 发相对路径，在服务端没有 base URL，远端模式下会每次都抛。
 */

import "server-only";

import { adminApiGet } from "../admin-resources/data-source.ts";
import { AdminApiError } from "../../lib/bff/client.ts";
import { adminDataSourceMode } from "../../lib/bff/config.ts";
import {
  normalizeAuditQuery,
  parseAuditEventListResponse,
  type AuditEventListResponse,
  type AuditListQuery,
} from "./audit-contracts.ts";
import { fixtureAuditEvents } from "./fixtures.ts";

export async function listAuditEvents(query: AuditListQuery = {}): Promise<AuditEventListResponse> {
  const normalized = normalizeAuditQuery(query);
  if (adminDataSourceMode() === "fixture") {
    return {
      ...fixtureAuditEvents(normalized),
      meta: { request_id: "fixture" },
    } as AuditEventListResponse;
  }
  try {
    return parseAuditEventListResponse(
      await adminApiGet("audit-events", {
        actor: normalized.actor,
        action: normalized.action,
        // 后端要的是字符串 "true"/"false"，不带这个参数才是「两种都要」。
        plaintext: normalized.plaintext === undefined ? undefined : String(normalized.plaintext),
        limit: normalized.limit,
        cursor: normalized.cursor,
      }),
    );
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(502, "unexpected_response", "Unexpected API response.");
  }
}

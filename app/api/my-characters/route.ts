import { NextResponse } from "next/server";
import { listAdminCharacters, getAdminUser } from "@/features/admin-resources/data-source";
import { getCurrentIdentity } from "@/lib/auth/session";
import { AdminApiError } from "@/lib/bff/client";
import { jsonError, requestIdFrom } from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  let identity;
  try {
    identity = await getCurrentIdentity(requestId);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    return NextResponse.json(
      { error: { code: error.code, message: error.message, request_id: error.requestId ?? requestId } },
      { status: error.status, headers: { "X-Request-Id": error.requestId ?? requestId } },
    );
  }
  if (!identity) return jsonError(request, 401, "admin_unauthenticated", "Sign in to continue.");
  if (!identity.capabilities.includes("operations.access")) {
    return jsonError(request, 403, "admin_permission_denied", "You do not have permission to view characters.");
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account")?.trim() ?? "";
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;
  if (!accountId || accountId.length > 200) {
    return jsonError(request, 422, "account_id_invalid", "请输入有效的 Plum 用户 ID。", {
      fields: { account: "required" },
    });
  }
  if (cursor && cursor.length > 2048) {
    return jsonError(request, 422, "cursor_invalid", "分页参数无效。");
  }

  try {
    const [accountResponse, characterResponse] = await Promise.all([
      getAdminUser(accountId),
      listAdminCharacters({ q: accountId, cursor, limit: 200, sort: "updated_at.desc" }),
    ]);
    const characters = characterResponse.data.filter(
      (character) => character.creator.platform_user_id === accountId,
    );
    return NextResponse.json(
      {
        data: { account: accountResponse.data, characters },
        page: characterResponse.page,
        meta: { request_id: requestId },
      },
      { headers: { "X-Request-Id": requestId } },
    );
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    return NextResponse.json(
      { error: { code: error.code, message: error.message, request_id: error.requestId ?? requestId } },
      { status: error.status, headers: { "X-Request-Id": error.requestId ?? requestId } },
    );
  }
}

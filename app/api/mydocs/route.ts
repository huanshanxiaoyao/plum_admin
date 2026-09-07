import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/auth/session";
import { AdminApiError } from "@/lib/bff/client";
import { PROJECT_DOCUMENT_MAX_BYTES } from "@/lib/project-documents/model";
import { ProjectDocumentValidationError } from "@/lib/project-documents/validation";
import { createUploadedProjectDocument } from "@/lib/server/project-documents";
import { isSameOrigin, jsonError, requestIdFrom } from "@/lib/server/http";

const MAX_MULTIPART_BYTES = PROJECT_DOCUMENT_MAX_BYTES + 512 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(request, 403, "csrf_rejected", "Request origin was rejected.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    return jsonError(request, 413, "document_too_large", "文档不能超过 5 MB。");
  }

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
  if (!identity.capabilities.includes("staff.manage")) {
    return jsonError(request, 403, "admin_permission_denied", "仅 Admin 可以上传项目文档。");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(request, 400, "invalid_multipart_body", "上传内容无法解析。");
  }
  const file = formData.get("file");
  const title = formData.get("title");
  if (!(file instanceof File)) {
    return jsonError(request, 422, "document_file_required", "请选择文档文件。", {
      fields: { file: "required" },
    });
  }
  if (typeof title !== "string") {
    return jsonError(request, 422, "document_title_invalid", "文档标题格式不正确。", {
      fields: { title: "must be a string" },
    });
  }

  try {
    const document = await createUploadedProjectDocument({ title, file, uploader: identity });
    return NextResponse.json(
      { data: document, meta: { request_id: requestId } },
      { status: 201, headers: { "X-Request-Id": requestId } },
    );
  } catch (error) {
    if (error instanceof ProjectDocumentValidationError) {
      return jsonError(request, 422, error.code, error.message, {
        fields: { [error.field]: error.code },
      });
    }
    console.error("Project document upload failed", { requestId, error });
    return jsonError(request, 500, "document_upload_failed", "文档上传失败，请稍后重试。");
  }
}

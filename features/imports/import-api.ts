/**
 * 浏览器侧的导入接口调用。
 *
 * 请求体的类型全部取自生成契约——直传申请少一个 `filename` 或 `width`，是 422，
 * 而且要等运营点了提交才会知道。这些调用只在远端数据源下发生；fixture 模式的
 * 导入台停在本地校验那一步，不会走到这里。
 */

import type {
  CropRect,
  ImageSetRequest,
  ImportExecuteResponse,
  MediaUploadRequest,
  PreflightResponse,
} from "./import-contracts.ts";
import type { PackageImage } from "./package-reader.ts";
import type { UploadTask, UploadTransport, UploadedPortrait } from "./upload-orchestrator.ts";
import type { ZipArchive } from "./zip-reader.ts";

const BASE = "/api/admin/imports";

export class ImportApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ImportApiError";
    this.status = status;
    this.code = code;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload.error as { code?: string; message?: string })
        : null;
    throw new ImportApiError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? "请求失败，请稍后重试。",
    );
  }
  return payload as T;
}

export function requestPreflight(body: object): Promise<PreflightResponse> {
  return postJson<PreflightResponse>("/characters/preflight", body);
}

export function submitImport(body: object): Promise<ImportExecuteResponse> {
  return postJson<ImportExecuteResponse>("/characters", body);
}

async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// 这两个响应的 data 在契约里是 additionalProperties:true 的开放对象，
// 生成类型给不出字段。窄化成实际用到的那几个字段，是刻意的。
type PresignedUpload = {
  readonly data: {
    readonly media_id: string;
    readonly upload: { readonly url: string; readonly fields: Record<string, string> };
  };
};

type ImageSetResponse = { readonly data: { readonly image_set_id: string } };

export type CropBox = { x: number; y: number; width: number; height: number };

/** 立绘 9:16、头像 1:1。契约里两个裁剪都是必填，省不成 null。 */
const PORTRAIT_ASPECT = 9 / 16;
const AVATAR_ASPECT = 1;

/**
 * 运营没填裁剪时按 PRD §打包规范居中裁到目标比例——直接发整张图会把非 9:16 的
 * 立绘拉变形，而"留空"在表格里是常态。
 */
export function centerCrop(aspect: number, width: number, height: number): CropRect {
  const wide = width / height > aspect;
  const w = wide ? (aspect * height) / width : 1;
  const h = wide ? 1 : width / aspect / height;
  return { contract_version: 2, x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}

function cropRect(
  box: CropBox | undefined,
  aspect: number,
  size: { width: number; height: number },
): CropRect {
  return box ? { contract_version: 2, ...box } : centerCrop(aspect, size.width, size.height);
}

/**
 * 契约要求申报像素尺寸。解码一次拿宽高，随即 `close()` 释放位图——
 * 这里同样是用完即弃，不能让 100 张解码结果堆在内存里。
 */
async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export type TransportOptions = {
  readonly ownerPlatformUserId: string;
  readonly crops: ReadonlyMap<string, { portrait?: CropBox; avatar?: CropBox }>;
};

/**
 * 单张立绘的完整链路：签发凭证 → 直传 S3 → complete → 生成图片集。
 *
 * 图片在这里才从压缩包解出来，用完即弃：`bytes` 出了这个函数就没有引用，
 * 100 张图不会同时驻留在内存里。
 */
export function createUploadTransport(
  archive: ZipArchive,
  options: TransportOptions,
): UploadTransport {
  return {
    async upload(task: UploadTask): Promise<UploadedPortrait> {
      const image: PackageImage = task.image;
      const bytes = await archive.read(image.entry);
      const checksum = await sha256Base64(bytes);
      const blob = new Blob([bytes as BlobPart], { type: image.contentType });
      const { width, height } = await measure(blob);

      const grantBody: MediaUploadRequest = {
        owner_platform_user_id: options.ownerPlatformUserId,
        filename: image.path,
        kind: "image",
        purpose: "character_portrait",
        content_type: image.contentType,
        bytes: bytes.length,
        checksum_sha256: checksum,
        width,
        height,
      };
      const granted = await postJson<PresignedUpload>("/media/uploads", grantBody);

      const form = new FormData();
      for (const [key, value] of Object.entries(granted.data.upload.fields)) {
        form.append(key, value);
      }
      form.append("file", blob);
      const uploaded = await fetch(granted.data.upload.url, { method: "POST", body: form });
      if (!uploaded.ok) {
        throw new ImportApiError(uploaded.status, "media_upload_failed", "立绘直传对象存储失败。");
      }

      await postJson(`/media/uploads/${encodeURIComponent(granted.data.media_id)}/complete`, {
        owner_platform_user_id: options.ownerPlatformUserId,
      });

      const crop = options.crops.get(task.rowKey);
      const imageSetBody: ImageSetRequest = {
        owner_platform_user_id: options.ownerPlatformUserId,
        source_media_id: granted.data.media_id,
        portrait_crop: cropRect(crop?.portrait, PORTRAIT_ASPECT, { width, height }),
        avatar_crop: cropRect(crop?.avatar, AVATAR_ASPECT, { width, height }),
      };
      const imageSet = await postJson<ImageSetResponse>("/media/image-sets", imageSetBody);

      return { mediaId: granted.data.media_id, imageSetId: imageSet.data.image_set_id };
    },
  };
}

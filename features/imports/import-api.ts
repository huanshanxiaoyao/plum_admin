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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { cache: "no-store" });
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

/**
 * 这两个响应的 `data` 在契约里是 `additionalProperties: true` 的开放对象，生成类型给不出
 * 字段，字段名只能在这里手写——**写错了 TypeScript 不会报，契约检查也不会报，只有运行时炸**。
 *
 * 2026-09-07 就栽在这里：读的是 `data.media_id` / `upload.url` / `upload.fields`，后端给的
 * 是 `data.media.media_id` / `upload.upload_url` / `upload.upload_fields`，四个键错了三个。
 * `Object.entries(undefined)` 抛出的 "Cannot convert undefined or null to object" 是运营
 * 能看到的全部信息，它不指向任何一个可修的地方。所以这里不只是写对，还要在运行时验一遍。
 *
 * 字段名的权威来源是后端自己的测试 `tests/products/plum/test_creator_media.py`。
 */
type PresignedUpload = {
  readonly data: {
    readonly media: { readonly media_id: string };
    readonly upload: {
      readonly upload_url: string;
      readonly upload_fields: Record<string, string>;
    };
  };
};

type ImageSetResponse = {
  readonly data: {
    readonly image_set: {
      readonly id: string;
      readonly source_media_id: string;
      readonly processing_status: string;
      readonly error_code?: string | null;
    };
  };
};

export type PresignedUploadGrant = {
  readonly mediaId: string;
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
};

/**
 * 把开放对象读成直传要用的三个值，缺哪个就点名哪个。
 *
 * 开放对象没有编译期保护，后端换个字段名就是一次静默失效；报出字段名，下一次至少能一眼
 * 看出是契约漂移，而不是从"某个东西是 undefined"开始猜。
 */
export function readPresignedUpload(payload: unknown): PresignedUploadGrant {
  const data = (payload as PresignedUpload | null)?.data;
  const mediaId = data?.media?.media_id;
  const url = data?.upload?.upload_url;
  const fields = data?.upload?.upload_fields;
  const missing = [
    typeof mediaId === "string" && mediaId ? null : "data.media.media_id",
    typeof url === "string" && url ? null : "data.upload.upload_url",
    fields && typeof fields === "object" ? null : "data.upload.upload_fields",
  ].filter((field): field is string => field !== null);
  if (missing.length > 0) {
    throw new ImportApiError(
      0,
      "media_upload_contract_mismatch",
      `预签发响应缺少 ${missing.join("、")}，后端返回的结构与前端预期不一致。`,
    );
  }
  return { mediaId: mediaId!, url: url!, fields: fields! };
}

export type ImageSetRef = {
  readonly id: string;
  /**
   * 图片集**自己**绑定的源 media，不一定是刚上传的那个。
   *
   * 图片集按「图片内容哈希 + 两个裁剪」去重（后端 `ON CONFLICT(owner, input_hash)`），
   * 重传同一个包时上传会拿到新的 media id，建图片集却会命中上一次的那条记录——它绑的是
   * 上一次的 media。导入行必须按这条记录的 `source_media_id` 来报，否则后端比对
   * `source_media_id != portrait_media_id`，整行报 `character_image_set_not_ready`。
   */
  readonly sourceMediaId: string;
  readonly processingStatus: "pending" | "processing" | "ready" | "failed";
  readonly errorCode: string | null;
};

/** 同上：图片集响应也是开放对象，字段名同样没有编译期保护。 */
export function readImageSet(payload: unknown): ImageSetRef {
  const imageSet = (payload as ImageSetResponse | null)?.data?.image_set;
  const id = imageSet?.id;
  const sourceMediaId = imageSet?.source_media_id;
  const processingStatus = imageSet?.processing_status;
  const validStatus = ["pending", "processing", "ready", "failed"].includes(
    processingStatus ?? "",
  );
  const missing = [
    typeof id === "string" && id ? null : "data.image_set.id",
    typeof sourceMediaId === "string" && sourceMediaId ? null : "data.image_set.source_media_id",
    validStatus ? null : "data.image_set.processing_status",
  ].filter((field): field is string => field !== null);
  if (missing.length > 0) {
    throw new ImportApiError(
      0,
      "image_set_contract_mismatch",
      `图片集响应缺少 ${missing.join("、")}，后端返回的结构与前端预期不一致。`,
    );
  }
  return {
    id: id!,
    sourceMediaId: sourceMediaId!,
    processingStatus: processingStatus as ImageSetRef["processingStatus"],
    errorCode:
      typeof imageSet?.error_code === "string" && imageSet.error_code
        ? imageSet.error_code
        : null,
  };
}

const IMAGE_SET_POLL_INTERVAL_MS = 1_000;
const IMAGE_SET_READY_TIMEOUT_MS = 5 * 60_000;

type WaitForImageSetOptions = {
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Wait until the renderer has produced the exact variants moderation will inspect. */
export async function waitForImageSetReady(
  initial: ImageSetRef,
  ownerPlatformUserId: string,
  options: WaitForImageSetOptions = {},
): Promise<ImageSetRef> {
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? IMAGE_SET_POLL_INTERVAL_MS);
  const deadline = Date.now() + Math.max(0, options.timeoutMs ?? IMAGE_SET_READY_TIMEOUT_MS);
  let imageSet = initial;

  for (;;) {
    if (imageSet.processingStatus === "ready") return imageSet;
    if (imageSet.processingStatus === "failed") {
      const code = imageSet.errorCode || "character_image_processing_failed";
      throw new ImportApiError(0, code, `立绘处理失败（${code}）。`);
    }
    if (Date.now() >= deadline) {
      throw new ImportApiError(
        0,
        "character_image_processing_timeout",
        "等待立绘处理完成超时，请稍后重试。",
      );
    }

    await delay(pollIntervalMs);
    const query = new URLSearchParams({ owner_platform_user_id: ownerPlatformUserId });
    imageSet = readImageSet(
      await getJson<ImageSetResponse>(
        `/media/image-sets/${encodeURIComponent(imageSet.id)}?${query.toString()}`,
      ),
    );
  }
}

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

/** 只为错误信息取个主机名；取不到就退回整串——排查时看到什么都比看不到强。 */
function uploadHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

type PreparedImage = {
  readonly bytes: Uint8Array;
  readonly blob: Blob;
  readonly filename: string;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
};

async function prepareFile(file: File): Promise<PreparedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { width, height } = await measure(file);
  return {
    bytes,
    blob: file,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    width,
    height,
  };
}

async function prepareSourceImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理参考图，请重新选择图片。");
    // The upload verifier rejects EXIF, XMP and PNG text; redraw only the pixels.
    context.drawImage(bitmap, 0, 0);
    const requestedType = file.type === "image/jpeg" || file.type === "image/webp"
      ? file.type
      : "image/png";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (encoded) => encoded ? resolve(encoded) : reject(new Error("参考图转换失败，请重新选择图片。")),
        requestedType,
        0.92,
      );
    });
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      blob,
      filename: `${file.name.replace(/\.[^.]+$/, "")}.${extension}`,
      contentType: blob.type,
      width,
      height,
    };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function uploadPreparedImage(
  image: PreparedImage,
  ownerPlatformUserId: string,
): Promise<string> {
  const checksum = await sha256Base64(image.bytes);
  const grantBody: MediaUploadRequest = {
    owner_platform_user_id: ownerPlatformUserId,
    filename: image.filename,
    kind: "image",
    purpose: "character_portrait",
    content_type: image.contentType,
    bytes: image.bytes.length,
    checksum_sha256: checksum,
    width: image.width,
    height: image.height,
  };
  const granted = readPresignedUpload(await postJson<PresignedUpload>("/media/uploads", grantBody));

  const form = new FormData();
  for (const [key, value] of Object.entries(granted.fields)) form.append(key, value);
  form.append("file", image.blob);
  let uploaded: Response;
  try {
    uploaded = await fetch(granted.url, { method: "POST", body: form });
  } catch {
    throw new ImportApiError(
      0,
      "media_upload_unreachable",
      `浏览器没能连上 ${uploadHost(granted.url)}：请求未发出或未返回，` +
        `通常是本站 CSP connect-src 或该 Bucket 的 CORS 没放行。`,
    );
  }
  if (!uploaded.ok) {
    throw new ImportApiError(uploaded.status, "media_upload_failed", "立绘直传对象存储失败。");
  }

  await postJson(`/media/uploads/${encodeURIComponent(granted.mediaId)}/complete`, {
    owner_platform_user_id: ownerPlatformUserId,
  });
  return granted.mediaId;
}

async function createPortraitImageSet(
  sourceMediaId: string,
  ownerPlatformUserId: string,
  size: { readonly width: number; readonly height: number },
  crop?: { readonly portrait?: CropBox; readonly avatar?: CropBox },
): Promise<UploadedPortrait> {
  const portraitCrop = cropRect(crop?.portrait, PORTRAIT_ASPECT, size);
  const avatarCrop = cropRect(crop?.avatar, AVATAR_ASPECT, size);
  const imageSetBody: ImageSetRequest = {
    owner_platform_user_id: ownerPlatformUserId,
    source_media_id: sourceMediaId,
    portrait_crop: portraitCrop,
    avatar_crop: avatarCrop,
  };
  const imageSet = await waitForImageSetReady(
    readImageSet(await postJson<ImageSetResponse>("/media/image-sets", imageSetBody)),
    ownerPlatformUserId,
  );
  return {
    mediaId: imageSet.sourceMediaId,
    imageSetId: imageSet.id,
    portraitCrop,
    avatarCrop,
  };
}

/** Upload a browser-selected source image into an owner's private media scope. */
export async function uploadSourceImageFile(
  file: File,
  ownerPlatformUserId: string,
): Promise<string> {
  const image = await prepareSourceImage(file);
  return uploadPreparedImage(image, ownerPlatformUserId);
}

/** Upload a browser-selected portrait and wait for its reusable image set. */
export async function uploadPortraitFile(
  file: File,
  ownerPlatformUserId: string,
  crop?: { readonly portrait?: CropBox; readonly avatar?: CropBox },
): Promise<UploadedPortrait> {
  const image = await prepareFile(file);
  const mediaId = await uploadPreparedImage(image, ownerPlatformUserId);
  return createPortraitImageSet(mediaId, ownerPlatformUserId, image, crop);
}

export type TransportOptions = {
  /** 批次默认归属。只在行上没有解析出归属时兜底。 */
  readonly ownerPlatformUserId: string;
  /**
   * row_key → 这一行的归属账号。
   *
   * 立绘必须传到**角色最终归属的那个账号**名下，不能一律用批次默认值：媒体、图片集和
   * 角色草稿都是 owner-scoped 的，服务端按 `(image_set_id, owner)` 查图片集，两边的
   * owner 不一致就查不到，整行报 `character_image_set_not_ready`。
   */
  readonly owners: ReadonlyMap<string, string>;
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
      const blob = new Blob([bytes as BlobPart], { type: image.contentType });
      const { width, height } = await measure(blob);
      const ownerId = options.owners.get(task.rowKey) || options.ownerPlatformUserId;
      const prepared: PreparedImage = {
        bytes,
        blob,
        filename: image.path,
        contentType: image.contentType,
        width,
        height,
      };
      const mediaId = await uploadPreparedImage(prepared, ownerId);
      return createPortraitImageSet(
        mediaId,
        ownerId,
        { width, height },
        options.crops.get(task.rowKey),
      );
    },
  };
}

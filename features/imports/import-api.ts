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

type ImageSetResponse = { readonly data: { readonly image_set: { readonly id: string } } };

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

/** 同上：图片集响应也是开放对象，`data.image_set.id` 同样没有编译期保护。 */
export function readImageSetId(payload: unknown): string {
  const id = (payload as ImageSetResponse | null)?.data?.image_set?.id;
  if (typeof id !== "string" || !id) {
    throw new ImportApiError(
      0,
      "image_set_contract_mismatch",
      "图片集响应缺少 data.image_set.id，后端返回的结构与前端预期不一致。",
    );
  }
  return id;
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
      const granted = readPresignedUpload(await postJson<PresignedUpload>("/media/uploads", grantBody));

      const form = new FormData();
      for (const [key, value] of Object.entries(granted.fields)) {
        form.append(key, value);
      }
      // `file` 必须最后 append：S3 POST 策略只校验它之前的表单字段。
      form.append("file", blob);
      // fetch 在这里抛异常只有一种含义：请求压根没走通——页面 CSP 的 connect-src 没放行
      // 对象存储、Bucket CORS 没放行本站 origin、DNS 或断网。这类失败在 S3 和后端两侧都不
      // 留任何痕迹，浏览器给的又只是一句 "Failed to fetch"，不在这里点名就只能靠猜。
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
        owner_platform_user_id: options.ownerPlatformUserId,
      });

      const crop = options.crops.get(task.rowKey);
      const imageSetBody: ImageSetRequest = {
        owner_platform_user_id: options.ownerPlatformUserId,
        source_media_id: granted.mediaId,
        portrait_crop: cropRect(crop?.portrait, PORTRAIT_ASPECT, { width, height }),
        avatar_crop: cropRect(crop?.avatar, AVATAR_ASPECT, { width, height }),
      };
      const imageSet = await postJson<ImageSetResponse>("/media/image-sets", imageSetBody);

      return { mediaId: granted.mediaId, imageSetId: readImageSetId(imageSet) };
    },
  };
}

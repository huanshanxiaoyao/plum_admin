/**
 * 把一个 zip 文件读成可以送去预检的内容。串起 `zip-reader` 与 `local-validation`，
 * 是导入台唯一需要直接调用的解包入口。
 *
 * **不解压图片。** 只读中央目录拿到条目表与解压后大小，图片留在压缩包里等上传阶段
 * 逐张取。600 MB 的包若在这里全部展开，浏览器会崩。
 */

import {
  MAX_PACKAGE_BYTES,
  type ManifestFormat,
  IMAGE_EXTENSIONS,
} from "./manifest-schema.ts";
import {
  type ManifestRow,
  type ValidationIssue,
  parseManifestText,
  validateManifestRows,
  validatePackageStructure,
} from "./local-validation.ts";
import { ZipArchive, ZipError, type ZipEntry } from "./zip-reader.ts";

export type PackageImage = {
  readonly path: string;
  readonly entry: ZipEntry;
  readonly contentType: string;
};

export type ReadPackageResult = {
  /** 解包成功时给出，供上传阶段逐张取图；结构性失败时为 undefined。 */
  readonly archive?: ZipArchive;
  readonly manifestFormat?: ManifestFormat;
  readonly columns: readonly string[];
  readonly rows: readonly ManifestRow[];
  readonly images: ReadonlyMap<string, PackageImage>;
  readonly issues: readonly ValidationIssue[];
};

function issue(code: string, message: string, path?: string): ValidationIssue {
  return { severity: "error", code, message, path };
}

const EMPTY: Omit<ReadPackageResult, "issues"> = {
  columns: [],
  rows: [],
  images: new Map(),
};

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0);
}

export async function readPackage(file: Blob): Promise<ReadPackageResult> {
  if (file.size > MAX_PACKAGE_BYTES) {
    return {
      ...EMPTY,
      issues: [
        issue(
          "package_too_large",
          `压缩包 ${megabytes(file.size)} MB，超过 ${megabytes(MAX_PACKAGE_BYTES)} MB 上限。` +
            "多半是图片没压过——1080×1920 的 JPEG 通常在 1 MB 以内。",
        ),
      ],
    };
  }

  let archive: ZipArchive;
  try {
    archive = await ZipArchive.open(file);
  } catch (caught) {
    if (caught instanceof ZipError) {
      return { ...EMPTY, issues: [issue(caught.code, caught.message, caught.path)] };
    }
    throw caught;
  }

  const structure = validatePackageStructure(archive.entries);
  if (!structure.structure) {
    return { ...EMPTY, archive, issues: structure.issues };
  }

  let manifestText: string;
  try {
    manifestText = await archive.readText(structure.structure.manifestEntry);
  } catch (caught) {
    if (caught instanceof ZipError) {
      return { ...EMPTY, archive, issues: [...structure.issues, issue(caught.code, caught.message)] };
    }
    // readText 用 fatal 解码，非 UTF-8 的表格会抛 TypeError 而不是 ZipError。
    return {
      ...EMPTY,
      archive,
      issues: [
        ...structure.issues,
        issue(
          "manifest_not_utf8",
          "表格不是 UTF-8 编码，中文会乱码。请在 Excel 里另存为「CSV UTF-8（逗号分隔）」。",
        ),
      ],
    };
  }

  const parsed = parseManifestText(manifestText, structure.structure.manifestFormat);
  const rowIssues = validateManifestRows(parsed.rows, parsed.columns, {
    images: structure.structure.images,
  });

  const images = new Map<string, PackageImage>();
  for (const path of structure.structure.images.keys()) {
    const entry = archive.find(path);
    if (!entry) continue;
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    const contentType = IMAGE_EXTENSIONS[extension];
    if (contentType) images.set(path, { path, entry, contentType });
  }

  return {
    archive,
    manifestFormat: structure.structure.manifestFormat,
    columns: parsed.columns,
    rows: parsed.rows,
    images,
    issues: [...structure.issues, ...parsed.issues, ...rowIssues],
  };
}

/** 按 `row_key` 归拢错误，供预检表逐行展示。没有 rowKey 的（包级问题）归到 `null` 键下。 */
export function groupIssuesByRow(
  issues: readonly ValidationIssue[],
): ReadonlyMap<string | null, readonly ValidationIssue[]> {
  const grouped = new Map<string | null, ValidationIssue[]>();
  for (const item of issues) {
    const key = item.rowKey ?? null;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

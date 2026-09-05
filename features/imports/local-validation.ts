/**
 * L1 本地校验：只用包内信息就能判定的规则，在浏览器里跑，不产生任何请求。
 *
 * 它的职责边界要守住——L1 是给运营的即时反馈，**不是安全边界**。服务端会用同一批规则
 * 外加 token 预算、归属账号、角色归属重新校验一遍（技术设计 §8）。这里放过的东西那里会拦，
 * 这里拦下的东西是为了让运营少等一轮网络往返。
 */

import type { ZipEntry } from "./zip-reader.ts";
import { CsvParseError, parseCsv } from "./csv.ts";
import {
  IMAGES_DIRECTORY,
  IMAGE_EXTENSIONS,
  MANIFEST_FIELDS,
  MANIFEST_FIELD_NAMES,
  MAX_IMAGE_BYTES,
  MAX_ROWS_PER_PACKAGE,
  MAX_TAGS_PER_CHARACTER,
  type ManifestFormat,
  isForbiddenColumn,
  isOperatingSystemArtifact,
  manifestField,
} from "./manifest-schema.ts";

export type IssueSeverity = "error" | "notice";

export type ValidationIssue = {
  readonly severity: IssueSeverity;
  readonly code: string;
  /** 面向运营的中文说明，必须能直接照着改。 */
  readonly message: string;
  readonly line?: number;
  readonly rowKey?: string;
  readonly column?: string;
  readonly path?: string;
};

function error(
  code: string,
  message: string,
  extra?: Omit<ValidationIssue, "severity" | "code" | "message">,
): ValidationIssue {
  return { severity: "error", code, message, ...extra };
}

function notice(
  code: string,
  message: string,
  extra?: Omit<ValidationIssue, "severity" | "code" | "message">,
): ValidationIssue {
  return { severity: "notice", code, message, ...extra };
}

export type PackageStructure = {
  readonly manifestEntry: ZipEntry;
  readonly manifestFormat: ManifestFormat;
  /** 图片路径 → 解压后字节数。用中央目录里的大小，不必解压就能判超限。 */
  readonly images: ReadonlyMap<string, number>;
};

export type PackageStructureResult = {
  readonly structure?: PackageStructure;
  readonly issues: readonly ValidationIssue[];
};

/** 顶层只允许 manifest 与 images/，其余一律报错——除了压缩工具塞的系统文件。 */
export function validatePackageStructure(entries: readonly ZipEntry[]): PackageStructureResult {
  const issues: ValidationIssue[] = [];
  const images = new Map<string, number>();
  const manifests: { entry: ZipEntry; format: ManifestFormat }[] = [];
  const artifacts: string[] = [];

  for (const entry of entries) {
    if (isOperatingSystemArtifact(entry.path)) {
      artifacts.push(entry.path);
      continue;
    }
    if (entry.isDirectory) {
      if (entry.path !== IMAGES_DIRECTORY) {
        issues.push(
          error("unexpected_directory", `压缩包里有多余的文件夹：${entry.path}`, { path: entry.path }),
        );
      }
      continue;
    }
    if (entry.nonAsciiName && !entry.utf8Name) {
      issues.push(
        error(
          "filename_not_utf8",
          "压缩包里的文件名不是 UTF-8 编码，解出来会是乱码。请把文件名改成英文和数字后重新压缩。",
          { path: entry.path },
        ),
      );
      continue;
    }

    if (entry.path === "manifest.csv") {
      manifests.push({ entry, format: "csv" });
      continue;
    }
    if (entry.path === "manifest.jsonl") {
      manifests.push({ entry, format: "jsonl" });
      continue;
    }
    if (entry.path === "manifest.xlsx" || entry.path === "manifest.xls") {
      issues.push(
        error(
          "manifest_format_unsupported",
          "不支持 Excel 文件。请在 Excel 里「另存为 → CSV UTF-8（逗号分隔）」，把 manifest.csv 放进包里。",
          { path: entry.path },
        ),
      );
      continue;
    }
    if (entry.path.startsWith(IMAGES_DIRECTORY)) {
      images.set(entry.path, entry.uncompressedSize);
      continue;
    }
    issues.push(
      error("unexpected_file", `压缩包里有多余的文件：${entry.path}。只能放 manifest 和 images/。`, {
        path: entry.path,
      }),
    );
  }

  if (artifacts.length > 0) {
    issues.push(
      notice(
        "os_artifacts_ignored",
        `已自动忽略 ${artifacts.length} 个系统文件（如 ${artifacts[0]}），它们是压缩工具自动加的，不影响导入。`,
      ),
    );
  }

  if (manifests.length === 0) {
    issues.push(
      error("manifest_missing", "压缩包里没有找到 manifest.csv 或 manifest.jsonl。"),
    );
    return { issues };
  }
  if (manifests.length > 1) {
    issues.push(
      error("manifest_ambiguous", "压缩包里同时有多个 manifest 文件，只能保留一个。"),
    );
    return { issues };
  }

  for (const [path, size] of images) {
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    if (!(extension in IMAGE_EXTENSIONS)) {
      issues.push(
        error("image_format_unsupported", `图片格式不支持：${path}。只能用 jpg / png / webp。`, {
          path,
        }),
      );
    }
    if (size > MAX_IMAGE_BYTES) {
      issues.push(
        error(
          "image_too_large",
          `图片超过 8 MB：${path}（${(size / 1024 / 1024).toFixed(1)} MB）。请先压缩再打包。`,
          { path },
        ),
      );
    }
  }

  const chosen = manifests[0];
  return {
    structure: { manifestEntry: chosen.entry, manifestFormat: chosen.format, images },
    issues,
  };
}

export type ManifestRow = {
  /** 源文件里的物理行号，用于报错定位。 */
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
};

export type ManifestParseResult = {
  readonly columns: readonly string[];
  readonly rows: readonly ManifestRow[];
  readonly issues: readonly ValidationIssue[];
};

function normalizeJsonValue(value: unknown): string | null {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // tag_ids 在 JSONL 里写成数组更自然，归一成竖线分隔后与 CSV 走同一条校验路径。
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join("|");
  }
  return null;
}

function parseJsonl(text: string): ManifestParseResult {
  const issues: ValidationIssue[] = [];
  const rows: ManifestRow[] = [];
  const columns = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === "") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      issues.push(error("jsonl_invalid", `第 ${line} 行不是合法的 JSON。`, { line }));
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      issues.push(error("jsonl_not_object", `第 ${line} 行必须是一个 JSON 对象。`, { line }));
      return;
    }

    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      columns.add(key);
      const normalized = normalizeJsonValue(value);
      if (normalized === null) {
        issues.push(
          error("jsonl_value_type", `第 ${line} 行的 ${key} 类型不支持，请用文本。`, {
            line,
            column: key,
          }),
        );
        continue;
      }
      values[key] = normalized;
    }
    rows.push({ line, values });
  });

  return { columns: [...columns], rows, issues };
}

function parseCsvManifest(text: string): ManifestParseResult {
  let records;
  try {
    records = parseCsv(text);
  } catch (caught) {
    if (caught instanceof CsvParseError) {
      return { columns: [], rows: [], issues: [error(caught.code, caught.message, { line: caught.line })] };
    }
    throw caught;
  }

  const issues: ValidationIssue[] = [];
  const meaningful = records.filter((record) => record.fields.some((field) => field.trim() !== ""));
  if (meaningful.length === 0) {
    return { columns: [], rows: [], issues: [error("manifest_empty", "表格是空的。")] };
  }

  const header = meaningful[0];
  const columns = header.fields.map((field) => field.trim());
  const rows: ManifestRow[] = [];

  for (const record of meaningful.slice(1)) {
    if (record.fields.length !== columns.length) {
      issues.push(
        error(
          "column_count_mismatch",
          `第 ${record.line} 行有 ${record.fields.length} 列，表头是 ${columns.length} 列。` +
            "多半是长文本里的逗号或换行没有用双引号包起来。",
          { line: record.line },
        ),
      );
      continue;
    }
    const values: Record<string, string> = {};
    columns.forEach((column, index) => {
      values[column] = record.fields[index];
    });
    rows.push({ line: record.line, values });
  }

  return { columns, rows, issues };
}

export function parseManifestText(text: string, format: ManifestFormat): ManifestParseResult {
  return format === "csv" ? parseCsvManifest(text) : parseJsonl(text);
}

function validateColumns(columns: readonly string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const column of columns) {
    if (column === "") {
      issues.push(error("column_empty", "表头里有空的列名。"));
      continue;
    }
    if (seen.has(column)) {
      issues.push(error("column_duplicated", `列名重复：${column}`, { column }));
      continue;
    }
    seen.add(column);

    if (isForbiddenColumn(column)) {
      issues.push(
        error("column_forbidden", `${column} 由系统决定，不能出现在表格里。`, { column }),
      );
      continue;
    }
    if (!MANIFEST_FIELD_NAMES.includes(column)) {
      issues.push(
        error("column_unknown", `不认识的列名：${column}。请对照打包规范检查拼写。`, { column }),
      );
    }
  }

  for (const field of MANIFEST_FIELDS) {
    if (field.columnRequired && !seen.has(field.name)) {
      issues.push(error("column_missing", `缺少必填列：${field.name}（${field.label}）`, { column: field.name }));
    }
  }

  return issues;
}

const CROP_PATTERN = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/;

function validateCrop(value: string): string | null {
  const matched = CROP_PATTERN.exec(value);
  if (!matched) return "格式应为四个数字，如 0.1,0,0.8,1";
  const [x, y, width, height] = matched.slice(1).map(Number);
  if ([x, y, width, height].some((part) => !Number.isFinite(part))) return "含有无法识别的数字";
  if (width <= 0 || height <= 0) return "宽高必须大于 0";
  if (x < 0 || y < 0 || x + width > 1 || y + height > 1) return "裁剪范围超出了图片边界";
  return null;
}

export type CropBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** 解析裁剪参数。与 `validateCrop` 共用同一个正则，避免"校验通过但解析不出来"。 */
export function parseCrop(value: string): CropBox | null {
  if (validateCrop(value) !== null) return null;
  const matched = CROP_PATTERN.exec(value);
  if (!matched) return null;
  const [x, y, width, height] = matched.slice(1).map(Number);
  return { x, y, width, height };
}

export type RowValidationContext = {
  /** 包内图片路径 → 字节数，来自 `validatePackageStructure`。 */
  readonly images: ReadonlyMap<string, number>;
};

/**
 * 逐行校验。行与行之间独立，一行有问题不影响其他行的判定——这与提交阶段"只导入通过的行"
 * 是同一个语义（PRD FR-IMP-04）。
 */
export function validateManifestRows(
  rows: readonly ManifestRow[],
  columns: readonly string[],
  context: RowValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [...validateColumns(columns)];

  if (rows.length === 0) {
    issues.push(error("manifest_no_rows", "表格里没有任何角色数据。"));
    return issues;
  }
  if (rows.length > MAX_ROWS_PER_PACKAGE) {
    issues.push(
      error(
        "too_many_rows",
        `一个包最多 ${MAX_ROWS_PER_PACKAGE} 个角色，当前有 ${rows.length} 个。请拆成多个包。`,
      ),
    );
  }

  const seenRowKeys = new Map<string, number>();
  const referencedImages = new Set<string>();

  for (const row of rows) {
    const rowKey = (row.values.row_key ?? "").trim();
    const at = { line: row.line, rowKey: rowKey || undefined };

    if (rowKey === "") {
      issues.push(error("row_key_missing", `第 ${row.line} 行没有填 row_key。`, { line: row.line }));
    } else if (seenRowKeys.has(rowKey)) {
      issues.push(
        error(
          "row_key_duplicated",
          `row_key 重复：${rowKey}（第 ${seenRowKeys.get(rowKey)} 行和第 ${row.line} 行）。`,
          at,
        ),
      );
    } else {
      seenRowKeys.set(rowKey, row.line);
    }

    for (const field of MANIFEST_FIELDS) {
      const raw = row.values[field.name];
      if (raw === undefined) continue;
      const value = raw.trim();

      if (field.valueRequired && value === "") {
        issues.push(
          error("value_required", `${field.name}（${field.label}）不能为空。`, {
            ...at,
            column: field.name,
          }),
        );
        continue;
      }
      if (value === "") continue;

      if (field.maxLength !== undefined && value.length > field.maxLength) {
        issues.push(
          error(
            "value_too_long",
            `${field.name}（${field.label}）超出 ${field.maxLength} 字符，当前 ${value.length}。`,
            { ...at, column: field.name },
          ),
        );
      }
      if (field.enumValues && !field.enumValues.includes(value)) {
        issues.push(
          error(
            "value_not_allowed",
            `${field.name}（${field.label}）只能填 ${field.enumValues.join(" / ")}，当前是「${value}」。`,
            { ...at, column: field.name },
          ),
        );
      }
    }

    const tags = (row.values.tag_ids ?? "").trim();
    if (tags !== "") {
      const parts = tags.split("|").map((part) => part.trim());
      if (parts.some((part) => part === "")) {
        issues.push(error("tag_empty", "tag_ids 里有空标签，检查竖线是否多打了。", { ...at, column: "tag_ids" }));
      }
      if (new Set(parts).size !== parts.length) {
        issues.push(error("tag_duplicated", "tag_ids 里有重复标签。", { ...at, column: "tag_ids" }));
      }
      if (parts.length > MAX_TAGS_PER_CHARACTER) {
        issues.push(
          error(
            "tag_too_many",
            `标签最多 ${MAX_TAGS_PER_CHARACTER} 个，当前 ${parts.length} 个。`,
            { ...at, column: "tag_ids" },
          ),
        );
      }
    }

    for (const cropColumn of ["portrait_crop", "avatar_crop"] as const) {
      const crop = (row.values[cropColumn] ?? "").trim();
      if (crop === "") continue;
      const problem = validateCrop(crop);
      if (problem) {
        issues.push(error("crop_invalid", `${cropColumn} ${problem}。`, { ...at, column: cropColumn }));
      }
    }

    const characterId = (row.values.character_id ?? "").trim();
    const portrait = (row.values.portrait_file ?? "").trim();

    if (portrait === "") {
      // 新建必须有立绘；更新留空表示沿用原图，是合法的。
      if (characterId === "") {
        issues.push(
          error("portrait_required", "新增角色必须提供立绘（portrait_file）。", {
            ...at,
            column: "portrait_file",
          }),
        );
      }
    } else if (!context.images.has(portrait)) {
      issues.push(
        error(
          "portrait_not_found",
          `找不到图片：${portrait}。检查路径、大小写和后缀是否与 images/ 里的文件一致。`,
          { ...at, column: "portrait_file" },
        ),
      );
    } else {
      referencedImages.add(portrait);
    }
  }

  for (const path of context.images.keys()) {
    if (!referencedImages.has(path)) {
      issues.push(notice("image_unreferenced", `图片没有被任何一行引用：${path}`, { path }));
    }
  }

  return issues;
}

export function hasBlockingIssue(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

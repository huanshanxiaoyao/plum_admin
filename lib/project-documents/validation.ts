import {
  PROJECT_DOCUMENT_MAX_BYTES,
  PROJECT_DOCUMENT_MAX_TITLE_LENGTH,
  type ProjectDocumentFormat,
} from "./model.ts";

const FORMAT_BY_EXTENSION: Readonly<Record<string, ProjectDocumentFormat>> = {
  ".htm": "html",
  ".html": "html",
  ".markdown": "markdown",
  ".md": "markdown",
};

const ALLOWED_MEDIA_TYPES = new Set([
  "",
  "application/octet-stream",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/x-markdown",
]);

export type ProjectDocumentUploadInput = {
  title: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
};

export type ValidatedProjectDocumentUpload = {
  title: string;
  format: ProjectDocumentFormat;
};

export class ProjectDocumentValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field: "file" | "title",
  ) {
    super(message);
    this.name = "ProjectDocumentValidationError";
  }
}
export function projectDocumentFormat(fileName: string): ProjectDocumentFormat | null {
  const extension = /\.[^.]+$/.exec(fileName.trim().toLowerCase())?.[0] ?? "";
  return FORMAT_BY_EXTENSION[extension] ?? null;
}

export function defaultProjectDocumentTitle(fileName: string): string {
  return fileName.trim().replace(/\.(?:html?|markdown|md)$/i, "").trim();
}

export function validateProjectDocumentUpload(
  input: ProjectDocumentUploadInput,
): ValidatedProjectDocumentUpload {
  const format = projectDocumentFormat(input.fileName);
  if (!format) {
    throw new ProjectDocumentValidationError(
      "unsupported_document_format",
      "仅支持 .md、.markdown、.html 和 .htm 文件。",
      "file",
    );
  }
  if (!ALLOWED_MEDIA_TYPES.has(input.mediaType.toLowerCase())) {
    throw new ProjectDocumentValidationError(
      "unsupported_document_media_type",
      "文件类型与 Markdown 或 HTML 格式不符。",
      "file",
    );
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ProjectDocumentValidationError("empty_document", "文档不能为空。", "file");
  }
  if (input.sizeBytes > PROJECT_DOCUMENT_MAX_BYTES) {
    throw new ProjectDocumentValidationError(
      "document_too_large",
      "文档不能超过 5 MB。",
      "file",
    );
  }

  const title = input.title.trim() || defaultProjectDocumentTitle(input.fileName);
  if (!title) {
    throw new ProjectDocumentValidationError("document_title_required", "请输入文档标题。", "title");
  }
  if (title.length > PROJECT_DOCUMENT_MAX_TITLE_LENGTH) {
    throw new ProjectDocumentValidationError(
      "document_title_too_long",
      `文档标题不能超过 ${PROJECT_DOCUMENT_MAX_TITLE_LENGTH} 个字符。`,
      "title",
    );
  }
  if (/\p{Cc}/u.test(title)) {
    throw new ProjectDocumentValidationError(
      "invalid_document_title",
      "文档标题包含无效字符。",
      "title",
    );
  }
  return { title, format };
}

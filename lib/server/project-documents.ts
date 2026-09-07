import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AdminIdentity } from "@/lib/auth/types";
import {
  type ProjectDocumentFormat,
  type UploadedProjectDocument,
} from "@/lib/project-documents/model";
import {
  ProjectDocumentValidationError,
  validateProjectDocumentUpload,
} from "@/lib/project-documents/validation";

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function storageRoot(): string {
  const configured = process.env.PROJECT_DOCUMENTS_DIR?.trim();
  return path.resolve(
    /*turbopackIgnore: true*/ configured || path.join(process.cwd(), "data", "project-documents"),
  );
}

function sourceExtension(format: ProjectDocumentFormat): string {
  return format === "html" ? ".html" : ".md";
}

function isUploadedProjectDocument(value: unknown): value is UploadedProjectDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<UploadedProjectDocument>;
  return (
    typeof document.id === "string" && DOCUMENT_ID_PATTERN.test(document.id) &&
    typeof document.title === "string" && document.title.length > 0 && document.title.length <= 120 &&
    typeof document.originalName === "string" && document.originalName.length > 0 &&
    (document.format === "markdown" || document.format === "html") &&
    typeof document.sizeBytes === "number" && Number.isSafeInteger(document.sizeBytes) &&
    document.sizeBytes > 0 && document.sizeBytes <= 5 * 1024 * 1024 &&
    typeof document.uploadedAt === "string" && !Number.isNaN(Date.parse(document.uploadedAt)) &&
    Boolean(document.uploadedBy) && typeof document.uploadedBy?.id === "string" &&
    typeof document.uploadedBy?.displayName === "string" &&
    typeof document.sha256 === "string" && HASH_PATTERN.test(document.sha256)
  );
}

async function readMetadata(id: string): Promise<UploadedProjectDocument | null> {
  if (!DOCUMENT_ID_PATTERN.test(id)) return null;
  try {
    const raw = await readFile(
      /*turbopackIgnore: true*/ path.join(storageRoot(), `${id}.json`),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    return isUploadedProjectDocument(parsed) && parsed.id === id ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listUploadedProjectDocuments(): Promise<readonly UploadedProjectDocument[]> {
  let entries;
  try {
    entries = await readdir(/*turbopackIgnore: true*/ storageRoot(), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const documents = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && DOCUMENT_ID_PATTERN.test(entry.name.replace(/\.json$/, "")))
      .filter((entry) => entry.name.endsWith(".json"))
      .map((entry) => readMetadata(entry.name.slice(0, -5))),
  );
  return documents
    .filter((document): document is UploadedProjectDocument => document !== null)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

export async function getUploadedProjectDocument(id: string): Promise<UploadedProjectDocument | null> {
  return readMetadata(id);
}

export async function readUploadedProjectDocument(
  document: UploadedProjectDocument,
): Promise<string> {
  const source = await readFile(
    /*turbopackIgnore: true*/ path.join(
      storageRoot(),
      `${document.id}${sourceExtension(document.format)}`,
    ),
  );
  if (source.byteLength !== document.sizeBytes) throw new Error("Project document size does not match metadata.");
  const hash = createHash("sha256").update(source).digest("hex");
  if (hash !== document.sha256) throw new Error("Project document checksum does not match metadata.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch {
    throw new Error("Project document is not valid UTF-8.");
  }
}

export async function createUploadedProjectDocument(input: {
  title: string;
  file: File;
  uploader: AdminIdentity;
}): Promise<UploadedProjectDocument> {
  const validated = validateProjectDocumentUpload({
    title: input.title,
    fileName: input.file.name,
    mediaType: input.file.type,
    sizeBytes: input.file.size,
  });
  const source = Buffer.from(await input.file.arrayBuffer());
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch {
    throw new ProjectDocumentValidationError(
      "invalid_document_encoding",
      "文档必须使用 UTF-8 编码。",
      "file",
    );
  }
  if (!content.trim() || content.includes("\u0000")) {
    throw new ProjectDocumentValidationError(
      "invalid_document_content",
      "文档内容为空或包含无效字符。",
      "file",
    );
  }

  const document: UploadedProjectDocument = {
    id: randomUUID(),
    title: validated.title,
    originalName: path.basename(input.file.name),
    format: validated.format,
    sizeBytes: source.byteLength,
    uploadedAt: new Date().toISOString(),
    uploadedBy: { id: input.uploader.id, displayName: input.uploader.displayName },
    sha256: createHash("sha256").update(source).digest("hex"),
  };
  const root = storageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const sourcePath = path.join(
    /*turbopackIgnore: true*/ root,
    `${document.id}${sourceExtension(document.format)}`,
  );
  const metadataPath = path.join(/*turbopackIgnore: true*/ root, `${document.id}.json`);
  const temporaryMetadataPath = `${metadataPath}.${randomUUID()}.tmp`;
  await writeFile(sourcePath, source, { flag: "wx", mode: 0o600 });
  try {
    await writeFile(temporaryMetadataPath, `${JSON.stringify(document, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryMetadataPath, metadataPath);
  } catch (error) {
    await Promise.allSettled([unlink(sourcePath), unlink(temporaryMetadataPath)]);
    throw error;
  }
  return document;
}

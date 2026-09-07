export const PROJECT_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const PROJECT_DOCUMENT_MAX_TITLE_LENGTH = 120;

export type ProjectDocumentFormat = "markdown" | "html";

export type UploadedProjectDocument = {
  id: string;
  title: string;
  originalName: string;
  format: ProjectDocumentFormat;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: {
    id: string;
    displayName: string;
  };
  sha256: string;
};

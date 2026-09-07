import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultProjectDocumentTitle,
  projectDocumentFormat,
  ProjectDocumentValidationError,
  validateProjectDocumentUpload,
} from "../lib/project-documents/validation.ts";
import { PROJECT_DOCUMENT_MAX_BYTES } from "../lib/project-documents/model.ts";

test("project documents recognize Markdown and HTML extensions case-insensitively", () => {
  assert.equal(projectDocumentFormat("guide.md"), "markdown");
  assert.equal(projectDocumentFormat("guide.MARKDOWN"), "markdown");
  assert.equal(projectDocumentFormat("report.html"), "html");
  assert.equal(projectDocumentFormat("report.HTM"), "html");
  assert.equal(projectDocumentFormat("report.pdf"), null);
  assert.equal(defaultProjectDocumentTitle(" release-notes.md "), "release-notes");
});
test("upload validation applies title defaults and rejects unsafe inputs", () => {
  assert.deepEqual(
    validateProjectDocumentUpload({
      title: " ",
      fileName: "release-notes.md",
      mediaType: "text/markdown",
      sizeBytes: 64,
    }),
    { title: "release-notes", format: "markdown" },
  );

  const invalidInputs = [
    { title: "x", fileName: "x.pdf", mediaType: "application/pdf", sizeBytes: 10 },
    { title: "x", fileName: "x.md", mediaType: "text/markdown", sizeBytes: 0 },
    {
      title: "x",
      fileName: "x.html",
      mediaType: "text/html",
      sizeBytes: PROJECT_DOCUMENT_MAX_BYTES + 1,
    },
    { title: "bad\u0000title", fileName: "x.md", mediaType: "text/plain", sizeBytes: 10 },
  ];
  for (const input of invalidInputs) {
    assert.throws(() => validateProjectDocumentUpload(input), ProjectDocumentValidationError);
  }
});

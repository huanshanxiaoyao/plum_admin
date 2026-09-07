"use client";

import { AlertTriangle, CheckCircle2, FileUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import {
  PROJECT_DOCUMENT_MAX_BYTES,
  PROJECT_DOCUMENT_MAX_TITLE_LENGTH,
} from "@/lib/project-documents/model";
import styles from "./upload-document-form.module.css";

function responseError(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = body.error;
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  return typeof error.message === "string" ? error.message : null;
}
export function UploadDocumentForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    if (file.size > PROJECT_DOCUMENT_MAX_BYTES) {
      setError("文档不能超过 5 MB。");
      return;
    }
    setPending(true);
    setError("");
    setSuccess("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/mydocs", { method: "POST", body: formData });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(body) ?? "文档上传失败，请重试。");
      setSuccess(`已上传 ${file.name}`);
      setFile(null);
      formRef.current?.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文档上传失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.titleField}>
        <span>文档标题</span>
        <input name="title" maxLength={PROJECT_DOCUMENT_MAX_TITLE_LENGTH} placeholder="默认使用文件名" />
      </label>
      <label className={styles.filePicker}>
        <FileUp size={16} aria-hidden="true" />
        <span>{file?.name ?? "选择文档"}</span>
        <input
          type="file"
          name="file"
          accept=".md,.markdown,.html,.htm,text/markdown,text/html"
          required
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError("");
            setSuccess("");
          }}
        />
      </label>
      <button type="submit" disabled={!file || pending}>
        {pending ? <LoaderCircle className={styles.spinning} size={15} /> : <FileUp size={15} />}
        {pending ? "上传中" : "上传"}
      </button>
      <small className={styles.constraint}>MD / HTML · 最大 5 MB</small>
      {error && <p className={styles.error} role="alert"><AlertTriangle size={14} />{error}</p>}
      {success && <p className={styles.success} role="status"><CheckCircle2 size={14} />{success}</p>}
    </form>
  );
}

import Link from "next/link";
import { ArrowLeft, FileCode2, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminWorkspace } from "@/features/admin-shell/admin-workspace";
import { requireIdentity } from "@/lib/auth/require-identity";
import { renderProjectMarkdown } from "@/lib/server/markdown";
import {
  getUploadedProjectDocument,
  readUploadedProjectDocument,
} from "@/lib/server/project-documents";
import styles from "./project-document-page.module.css";

export async function ProjectDocumentPage({ id }: { id: string }) {
  const identity = await requireIdentity(`/mydocs/${encodeURIComponent(id)}`, "operations.access");
  const document = await getUploadedProjectDocument(id);
  if (!document) notFound();
  const source = await readUploadedProjectDocument(document);
  const html = document.format === "markdown" ? renderProjectMarkdown(source) : source;
  const FormatIcon = document.format === "html" ? FileCode2 : FileText;

  return (
    <AdminWorkspace identity={identity}>
      <article className={styles.page}>
        <header className={styles.header}>
          <Link href="/mydocs" className={styles.back} aria-label="返回项目文档">
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <div>
            <span><FormatIcon size={14} aria-hidden="true" />{document.format === "html" ? "HTML" : "MD"}</span>
            <h1>{document.title}</h1>
          </div>
        </header>
        {document.format === "html" ? (
          <iframe
            className={styles.htmlFrame}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={html}
            title={document.title}
          />
        ) : (
          <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </article>
    </AdminWorkspace>
  );
}

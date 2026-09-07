import Link from "next/link";
import { ArrowRight, FileCode2, FileText } from "lucide-react";
import { AdminWorkspace } from "@/features/admin-shell/admin-workspace";
import { requireIdentity } from "@/lib/auth/require-identity";
import { listUploadedProjectDocuments } from "@/lib/server/project-documents";
import { PROJECT_DOCUMENTS } from "./documents";
import { UploadDocumentForm } from "./upload-document-form";
import styles from "./mydocs.module.css";

export async function MyDocsPage() {
  const identity = await requireIdentity("/mydocs", "operations.access");
  const uploadedDocuments = await listUploadedProjectDocuments();

  return (
    <AdminWorkspace identity={identity}>
      <section className={styles.page} aria-labelledby="mydocs-title">
        <h1 id="mydocs-title">项目文档</h1>
        {identity.capabilities.includes("staff.manage") && <UploadDocumentForm />}
        {PROJECT_DOCUMENTS.length || uploadedDocuments.length ? (
          <ul className={styles.documents}>
            {PROJECT_DOCUMENTS.map((document) => (
              <li key={document.href}>
                <Link href={document.href} prefetch={false}>
                  <FileText size={18} aria-hidden="true" />
                  <span><strong>{document.title}</strong><small>内置文档</small></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
            {uploadedDocuments.map((document) => {
              const FormatIcon = document.format === "html" ? FileCode2 : FileText;
              return (
                <li key={document.id}>
                  <Link href={`/mydocs/${document.id}`} prefetch={false}>
                    <FormatIcon size={18} aria-hidden="true" />
                    <span>
                      <strong>{document.title}</strong>
                      <small>{document.format === "html" ? "HTML" : "MD"} · {document.originalName}</small>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className={styles.empty}>暂无文档</p>}
      </section>
    </AdminWorkspace>
  );
}

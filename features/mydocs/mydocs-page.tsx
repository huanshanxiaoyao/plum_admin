import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { AdminWorkspace } from "@/features/admin-shell/admin-workspace";
import { requireIdentity } from "@/lib/auth/require-identity";
import { PROJECT_DOCUMENTS } from "./documents";
import styles from "./mydocs.module.css";

export async function MyDocsPage() {
  const identity = await requireIdentity("/mydocs", "operations.access");

  return (
    <AdminWorkspace identity={identity}>
      <section className={styles.page} aria-labelledby="mydocs-title">
        <h1 id="mydocs-title">项目文档</h1>
        {PROJECT_DOCUMENTS.length ? (
          <ul className={styles.documents}>
            {PROJECT_DOCUMENTS.map((document) => (
              <li key={document.href}>
                <Link href={document.href} prefetch={false}>
                  <FileText size={18} aria-hidden="true" />
                  <span>{document.title}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>暂无文档</p>}
      </section>
    </AdminWorkspace>
  );
}

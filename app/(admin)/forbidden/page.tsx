import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import styles from "./status.module.css";

export default function ForbiddenPage() {
  return (
    <section className={styles.status}>
      <ShieldX size={30} />
      <span>403</span>
      <h1>权限不足</h1>
      <p>此操作需要 Admin 权限。</p>
      <Link href="/">
        <ArrowLeft size={16} /> 返回工作台
      </Link>
    </section>
  );
}

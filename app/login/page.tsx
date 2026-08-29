import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getCurrentIdentity } from "@/lib/auth/session";
import { isMockAuthEnabled } from "@/lib/auth/mock-identities";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export default async function LoginPage() {
  if (await getCurrentIdentity()) redirect("/");

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <Brand />
        <div className={styles.heading}>
          <span>INTERNAL ACCESS</span>
          <h1>企业账号登录</h1>
          <p>Plum 内部管理控制台</p>
        </div>
        <LoginForm mockEnabled={isMockAuthEnabled()} />
        <footer>admin.plum.top</footer>
      </section>
    </main>
  );
}

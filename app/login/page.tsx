import { redirect } from "next/navigation";
import { Brand } from "@/features/admin-shell/brand";
import { getCurrentIdentity } from "@/lib/auth/session";
import { isMockAuthEnabled } from "@/lib/auth/mock-identities";
import { isFeishuAuthEnabled } from "@/lib/auth/auth-mode";
import { AdminApiError } from "@/lib/bff/client";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

const LOGIN_ERRORS: Record<string, string> = {
  authorization_declined: "已取消飞书授权。",
  invalid_oauth_state: "登录请求已失效，请重新尝试。",
  login_configuration: "登录配置不可用，请联系 Admin。",
  login_failed: "登录失败，请稍后重试或联系 Admin。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  try {
    if (await getCurrentIdentity()) redirect("/");
  } catch (error) {
    if (!(error instanceof AdminApiError) || (error.status !== 401 && error.status !== 403)) {
      throw error;
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <Brand />
        <div className={styles.heading}>
          <span>INTERNAL ACCESS</span>
          <h1>企业账号登录</h1>
          <p>Plum 内部管理控制台</p>
        </div>
        <LoginForm
          mockEnabled={isMockAuthEnabled()}
          feishuEnabled={isFeishuAuthEnabled()}
          initialError={LOGIN_ERRORS[(await searchParams).error ?? ""]}
        />
        <footer>admin.plum.top</footer>
      </section>
    </main>
  );
}

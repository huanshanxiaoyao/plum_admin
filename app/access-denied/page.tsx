import { ShieldX } from "lucide-react";
import { cookies } from "next/headers";
import { AccessDeniedActions } from "./access-denied-actions";
import { DENIED_IDENTITY_COOKIE_NAME } from "@/lib/auth/oauth-cookies";
import { verifyDeniedIdentityToken } from "@/lib/auth/oauth-state";
import { getSessionSecret } from "@/lib/auth/session";
import styles from "./status.module.css";

const MESSAGES: Record<string, string> = {
  admin_user_disabled: "该后台成员已被停用。",
  admin_user_unknown: "该企业账号尚未开通 Plum 后台权限。",
  admin_role_unsupported: "该账号角色不能访问 Plum 后台。",
  admin_identity_conflict: "账号身份信息存在冲突，请联系 Admin 处理。",
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const cookieStore = await cookies();
  const deniedIdentity = await verifyDeniedIdentityToken(
    cookieStore.get(DENIED_IDENTITY_COOKIE_NAME)?.value,
    getSessionSecret(),
  );
  return (
    <main className={styles.page}>
      <section className={styles.status}>
        <ShieldX size={30} />
        <span>403</span>
        <h1>无法访问 Plum 后台</h1>
        <p>{MESSAGES[code ?? ""] ?? "当前账号没有访问权限。"}</p>
        {deniedIdentity && (
          <dl className={styles.identity}>
            <div>
              <dt>飞书账号</dt>
              <dd>{deniedIdentity.displayName}</dd>
            </div>
            <div>
              <dt>Open ID</dt>
              <dd>{deniedIdentity.openId}</dd>
            </div>
          </dl>
        )}
        <AccessDeniedActions />
      </section>
    </main>
  );
}

"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function AccessDeniedActions() {
  const router = useRouter();

  async function clearSession() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={clearSession}>
      <LogOut size={16} /> 退出并重新登录
    </button>
  );
}

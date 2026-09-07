"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Blocks,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  BookOpen,
  House,
  LogOut,
  Menu,
  PackagePlus,
  ReceiptText,
  ShieldAlert,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { AdminModule, AdminModuleKey } from "@/features/admin-navigation/modules";
import type { AdminIdentity } from "@/lib/auth/types";
import { Brand } from "./brand";
import styles from "./admin-shell.module.css";

const NAV_ICONS: Record<AdminModuleKey, LucideIcon> = {
  dashboard: House,
  characters: BadgeCheck,
  characterFactory: Blocks,
  imports: PackagePlus,
  moderation: ShieldAlert,
  creators: UsersRound,
  users: CircleUserRound,
  subscriptions: ReceiptText,
  audit: ClipboardList,
  staff: Users,
  mydocs: BookOpen,
};

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** 页面底部的次级入口。不属于日常运营导航，因此不进 `ADMIN_MODULES`。 */
export type AdminFooterLink = { href: string; label: string };

export function AdminShell({
  identity,
  navigation,
  environmentLabel,
  footerLinks = [],
  children,
}: {
  identity: AdminIdentity;
  navigation: readonly AdminModule[];
  environmentLabel: string;
  footerLinks?: readonly AdminFooterLink[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <Brand />
          <button className={styles.mobileClose} type="button" onClick={() => setMenuOpen(false)} aria-label="关闭导航">
            <X size={19} />
          </button>
        </div>
        <nav className={styles.nav} aria-label="主导航">
          {navigation.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.active : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <span className={styles.statusDot} />
          <span>{environmentLabel}</span>
        </div>
      </aside>

      {menuOpen && <button className={styles.scrim} type="button" aria-label="关闭导航" onClick={() => setMenuOpen(false)} />}

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} type="button" onClick={() => setMenuOpen(true)} aria-label="打开导航">
            <Menu size={20} />
          </button>
          <div className={styles.breadcrumb}>
            <Activity size={16} />
            <span>Plum Operations</span>
          </div>
          <div className={styles.accountWrap}>
            <button
              type="button"
              className={styles.accountButton}
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((value) => !value)}
            >
              <span className={styles.avatar}>{identity.displayName.slice(0, 1).toUpperCase()}</span>
              <span className={styles.accountCopy}>
                <strong>{identity.displayName}</strong>
                <small>{identity.role}</small>
              </span>
              <ChevronDown size={15} />
            </button>
            {accountOpen && (
              <div className={styles.accountMenu}>
                <div>
                  <strong>{identity.email}</strong>
                  <span>{identity.capabilities.length} capabilities</span>
                </div>
                <button type="button" onClick={signOut}>
                  <LogOut size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </header>
        <main className={styles.content}>{children}</main>
        {footerLinks.length > 0 && (
          <footer className={styles.pageFooter}>
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}

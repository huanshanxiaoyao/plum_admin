"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./factory-tabs.module.css";

const FACTORY_VIEWS = [
  { href: "/character-factory/single", label: "单角色生成" },
  { href: "/character-factory/multi", label: "多角色生成" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FactoryTabs({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>CHARACTER FACTORY</span>
          <h1>角色工厂</h1>
          <p>从创意输入到可提交角色草稿</p>
        </div>
        <nav className={styles.tabs} aria-label="角色工厂生成方式">
          {FACTORY_VIEWS.map((view) => {
            const active = isActivePath(pathname, view.href);
            return (
              <Link
                key={view.href}
                href={view.href}
                className={active ? styles.active : undefined}
                aria-current={active ? "page" : undefined}
              >
                {view.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}

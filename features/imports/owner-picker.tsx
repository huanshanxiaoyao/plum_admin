"use client";

import { Check, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UserSummary } from "@/features/admin-resources/contracts";
import styles from "./imports.module.css";

export type OwnerAccount = {
  readonly platformUserId: string;
  readonly displayName: string;
  readonly membershipStatus: UserSummary["membership_status"];
};

type Props = {
  readonly value: OwnerAccount | null;
  readonly disabled: boolean;
  readonly onChange: (owner: OwnerAccount | null) => void;
};

/**
 * 批次默认归属账号的选择器。
 *
 * **搜索选择，不手敲 ID。** 手敲一串 `pu_9f21c8` 没有任何反馈，敲错了要到导入那一刻才发现，
 * 而那时内容已经挂到别人名下了。这里复用已有的 `GET /admin/plum/users?q=`，
 * 不需要后端新增接口。服务端在预检与导入时仍会重新校验一遍。
 */
export function OwnerPicker({ value, disabled, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly UserSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(0);

  const keyword = query.trim();
  // 展示条件是派生出来的，不在 effect 里清空 results——那会触发级联渲染。
  const showResults = !value && keyword.length >= 2;

  useEffect(() => {
    if (!showResults) return;
    const ticket = latest.current + 1;
    latest.current = ticket;
    // 防抖：运营边打字边搜，每个字符都发一次请求既没用也浪费后端配额。
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const response = await fetch(
          `/api/admin/users?q=${encodeURIComponent(keyword)}&status=active&limit=8`,
        );
        const payload: unknown = await response.json();
        if (latest.current !== ticket) return;
        if (!response.ok) throw new Error("搜索失败");
        const data =
          payload && typeof payload === "object" && "data" in payload ? payload.data : [];
        setResults(Array.isArray(data) ? (data as UserSummary[]) : []);
      } catch {
        if (latest.current === ticket) setError("账号搜索失败，请稍后重试。");
      } finally {
        if (latest.current === ticket) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword, showResults]);

  if (value) {
    return (
      <div className={styles.ownerSelected}>
        <Check size={15} />
        <div>
          <strong>{value.displayName}</strong>
          <code>{value.platformUserId}</code>
        </div>
        <button type="button" disabled={disabled} onClick={() => onChange(null)} title="换一个账号">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.ownerPicker}>
      <label className={styles.ownerSearch}>
        {searching ? <LoaderCircle className={styles.spinning} size={15} /> : <Search size={15} />}
        <input
          value={query}
          disabled={disabled}
          placeholder="搜索姓名或平台用户 ID"
          aria-label="搜索归属账号"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error && <small className={styles.ownerError}>{error}</small>}
      {showResults && results.length > 0 && (
        <ul className={styles.ownerResults}>
          {results.map((user) => (
            <li key={user.platform_user_id}>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    platformUserId: user.platform_user_id,
                    displayName: user.display_name,
                    membershipStatus: user.membership_status,
                  })
                }
              >
                <strong>{user.display_name}</strong>
                <code>{user.platform_user_id}</code>
                <small>{user.is_creator ? "创作者" : "普通用户"}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showResults && !searching && results.length === 0 && !error && (
        <small className={styles.ownerError}>没有匹配的账号。归属账号必须是已存在且会员状态正常的平台用户。</small>
      )}
    </div>
  );
}

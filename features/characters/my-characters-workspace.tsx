"use client";

import Link from "next/link";
import {
  BarChart3,
  Check,
  ChevronDown,
  ListFilter,
  LoaderCircle,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterSummary, PageInfo, UserSummary } from "@/features/admin-resources/contracts";
import styles from "./my-characters-workspace.module.css";

type BoundAccount = {
  readonly platformUserId: string;
  readonly displayName: string;
  readonly profileHandle: string | null;
  readonly characterCount: number;
};

type AccountCharactersPayload = {
  data: {
    account: UserSummary;
    characters: CharacterSummary[];
  };
  page: PageInfo;
};

type ViewMode = "persona" | "stats";

function accountFromUser(user: UserSummary): BoundAccount {
  return {
    platformUserId: user.platform_user_id,
    displayName: user.display_name,
    profileHandle: user.profile_handle ?? null,
    characterCount: user.character_count,
  };
}

export function parseBoundAccounts(value: string | null): BoundAccount[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (
        typeof record.platformUserId !== "string" ||
        typeof record.displayName !== "string" ||
        !(record.profileHandle === null || typeof record.profileHandle === "string") ||
        typeof record.characterCount !== "number" ||
        !Number.isInteger(record.characterCount) ||
        record.characterCount < 0
      ) return [];
      return [{
        platformUserId: record.platformUserId,
        displayName: record.displayName,
        profileHandle: record.profileHandle,
        characterCount: record.characterCount,
      }];
    });
  } catch {
    return [];
  }
}

async function fetchAccountCharacters(accountId: string, cursor?: string): Promise<AccountCharactersPayload> {
  const query = new URLSearchParams({ account: accountId });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/my-characters?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload
      ? (payload.error as Record<string, unknown>)
      : null;
    throw new Error(typeof error?.message === "string" ? error.message : "账号或角色加载失败。");
  }
  return payload as AccountCharactersPayload;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function statusLabel(status: CharacterSummary["status"]): string {
  return { draft: "草稿", active: "已上线", takedown: "已下架", archived: "已归档" }[status];
}

export function MyCharactersWorkspace({ operatorId }: { operatorId: string }) {
  const storageKey = `plum-admin:my-character-accounts:v1:${operatorId}`;
  const [hydrated, setHydrated] = useState(false);
  const [accounts, setAccounts] = useState<BoundAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [managingAccounts, setManagingAccounts] = useState(false);
  const [accountInput, setAccountInput] = useState("");
  const [binding, setBinding] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("persona");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<{ names: string[]; instruction: string } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = parseBoundAccounts(window.localStorage.getItem(storageKey));
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setAccounts(stored);
      setSelectedAccountId(stored[0]?.platformUserId ?? "");
      setManagingAccounts(stored.length === 0);
      setHydrated(true);
    });
    return () => { current = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !selectedAccountId) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setLoading(true);
      setLoadError("");
      setSelectedIds(new Set());
      setInstruction("");
      setPreview(null);
      void fetchAccountCharacters(selectedAccountId)
        .then((payload) => {
          if (!current) return;
          setCharacters(payload.data.characters);
          setNextCursor(payload.page.next_cursor ?? null);
          setHasMore(payload.page.has_more);
          const fresh = accountFromUser(payload.data.account);
          setAccounts((existing) => {
            const next = existing.map((account) => account.platformUserId === fresh.platformUserId ? fresh : account);
            window.localStorage.setItem(storageKey, JSON.stringify(next));
            return next;
          });
        })
        .catch((error: unknown) => {
          if (current) setLoadError(error instanceof Error ? error.message : "角色加载失败。");
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    });
    return () => { current = false; };
  }, [hydrated, selectedAccountId, storageKey]);

  const filteredCharacters = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return characters.filter((character) =>
      (!keyword || `${character.display_name} ${character.id}`.toLocaleLowerCase().includes(keyword)) &&
      (!status || character.status === status) &&
      (!rating || character.content_rating === rating));
  }, [characters, query, rating, status]);

  const visibleSelectedCount = filteredCharacters.filter((character) => selectedIds.has(character.id)).length;
  const allVisibleSelected = filteredCharacters.length > 0 && visibleSelectedCount === filteredCharacters.length;
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [allVisibleSelected, visibleSelectedCount]);

  function persistAccounts(next: BoundAccount[]) {
    setAccounts(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  async function bindAccount() {
    const accountId = accountInput.trim();
    if (!accountId) {
      setBindingError("请输入 Plum 用户 ID。");
      return;
    }
    if (accounts.some((account) => account.platformUserId === accountId)) {
      setBindingError("该账号已经绑定。");
      return;
    }
    setBinding(true);
    setBindingError("");
    try {
      const payload = await fetchAccountCharacters(accountId);
      if (payload.data.account.membership_status !== "active") {
        throw new Error("该账号已停用，不能绑定。");
      }
      const account = accountFromUser(payload.data.account);
      persistAccounts([...accounts, account]);
      setAccountInput("");
      setSelectedAccountId(account.platformUserId);
      setManagingAccounts(false);
    } catch (error) {
      setBindingError(error instanceof Error ? error.message : "绑定失败，请稍后重试。");
    } finally {
      setBinding(false);
    }
  }

  function removeAccount(accountId: string) {
    const next = accounts.filter((account) => account.platformUserId !== accountId);
    persistAccounts(next);
    if (selectedAccountId === accountId) {
      setCharacters([]);
      setSelectedAccountId(next[0]?.platformUserId ?? "");
    }
    if (next.length === 0) setManagingAccounts(true);
  }

  function toggleCharacter(characterId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
    setPreview(null);
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredCharacters.forEach((character) => next.delete(character.id));
      else filteredCharacters.forEach((character) => next.add(character.id));
      return next;
    });
    setPreview(null);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError("");
    try {
      const payload = await fetchAccountCharacters(selectedAccountId, nextCursor);
      setCharacters((current) => {
        const known = new Set(current.map((character) => character.id));
        return [...current, ...payload.data.characters.filter((character) => !known.has(character.id))];
      });
      setNextCursor(payload.page.next_cursor ?? null);
      setHasMore(payload.page.has_more);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "更多角色加载失败。");
    } finally {
      setLoadingMore(false);
    }
  }

  function createPreview() {
    const request = instruction.trim();
    if (!request || selectedIds.size === 0) return;
    setPreview({
      names: characters.filter((character) => selectedIds.has(character.id)).map((character) => character.display_name),
      instruction: request,
    });
  }

  if (!hydrated) return <div className={styles.loadingState}><LoaderCircle size={18} />正在读取绑定账号</div>;

  const currentAccount = accounts.find((account) => account.platformUserId === selectedAccountId);

  return (
    <section className={styles.workspace} aria-label="我的角色">
      <div className={styles.accountBar}>
        <label className={styles.accountSelect}>
          <span>当前创作者账号</span>
          <span className={styles.selectWrap}>
            <select
              value={selectedAccountId}
              disabled={accounts.length === 0}
              aria-label="当前创作者账号"
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              {accounts.length === 0 && <option value="">尚未绑定账号</option>}
              {accounts.map((account) => <option key={account.platformUserId} value={account.platformUserId}>{account.displayName} · {account.platformUserId}</option>)}
            </select>
            <ChevronDown size={14} />
          </span>
        </label>
        <div className={styles.accountMeta}>
          <strong>{currentAccount?.characterCount ?? 0}</strong>
          <span>个角色</span>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={() => setManagingAccounts((value) => !value)}>
          <Settings2 size={14} />管理绑定
        </button>
      </div>

      {managingAccounts && (
        <section className={styles.bindingPanel} aria-labelledby="bind-account-title">
          <div className={styles.bindingCopy}>
            <span>PLUM ACCOUNT</span>
            <h2 id="bind-account-title">绑定创作者账号</h2>
            <p>输入 plum.top 用户 ID。一个后台账号可以绑定多个创作者账号，每次管理其中一个。</p>
          </div>
          <div className={styles.bindingControls}>
            <div className={styles.bindingForm}>
              <label><span>Plum 用户 ID</span><input value={accountInput} placeholder="例如 pusr_xxx" onChange={(event) => setAccountInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void bindAccount(); } }} /></label>
              <button type="button" disabled={binding} onClick={() => void bindAccount()}>{binding ? <LoaderCircle className={styles.spin} size={14} /> : <Plus size={14} />}校验并绑定</button>
            </div>
            {bindingError && <p className={styles.error} role="alert">{bindingError}</p>}
            {accounts.length > 0 && <ul className={styles.boundList}>{accounts.map((account) => (
              <li key={account.platformUserId}>
                <span className={styles.accountAvatar}>{account.displayName.slice(0, 1)}</span>
                <span><strong>{account.displayName}</strong><code>{account.platformUserId}{account.profileHandle ? ` · @${account.profileHandle}` : ""}</code></span>
                <span className={styles.boundState}><Check size={13} />已绑定</span>
                <button type="button" aria-label={`移除 ${account.displayName}`} title="移除绑定" onClick={() => removeAccount(account.platformUserId)}><Trash2 size={14} /></button>
              </li>
            ))}</ul>}
          </div>
        </section>
      )}

      {selectedAccountId && (
        <>
          <div className={styles.toolbar}>
            <label className={styles.search}><ListFilter size={15} /><input type="search" value={query} placeholder="搜索角色名称或 ID" aria-label="搜索我的角色" onChange={(event) => setQuery(event.target.value)} /></label>
            <label className={styles.filter}><select value={status} aria-label="我的角色状态" onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="active">已上线</option><option value="draft">草稿</option><option value="takedown">已下架</option><option value="archived">已归档</option></select><ChevronDown size={13} /></label>
            <label className={styles.filter}><select value={rating} aria-label="我的角色评级" onChange={(event) => setRating(event.target.value)}><option value="">全部评级</option><option value="general">General</option><option value="mature">Mature</option></select><ChevronDown size={13} /></label>
            <div className={styles.viewSwitch} aria-label="角色列表视图">
              <button className={viewMode === "persona" ? styles.activeView : undefined} type="button" aria-pressed={viewMode === "persona"} onClick={() => setViewMode("persona")}><ListFilter size={13} />人设</button>
              <button className={viewMode === "stats" ? styles.activeView : undefined} type="button" aria-pressed={viewMode === "stats"} onClick={() => setViewMode("stats")}><BarChart3 size={13} />统计</button>
            </div>
          </div>

          <section className={`${styles.roleList} ${viewMode === "stats" ? styles.statsMode : ""}`} aria-label="当前账号的角色列表">
            {viewMode === "stats" && <p className={styles.dataNote}>互动数来自当前角色接口；连接、曝光和点击暂无数据时留空。</p>}
            <div className={styles.roleHead}>
              <input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} aria-label="全选当前结果" onChange={toggleAllVisible} />
              <span>缩略图</span><span>角色</span>
              {viewMode === "persona" ? <><span>人设条件</span><span>状态</span><span>更新</span></> : <><span>连接数</span><span>互动数</span><span>总曝光</span><span>总点击</span></>}
            </div>
            {loading ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={18} /><strong>正在加载角色</strong></div> : loadError && characters.length === 0 ? <div className={styles.emptyState}><strong>角色加载失败</strong><span>{loadError}</span></div> : filteredCharacters.length === 0 ? <div className={styles.emptyState}><strong>没有符合条件的角色</strong><span>调整筛选条件，或为该账号创建角色。</span></div> : filteredCharacters.map((character) => (
              <div className={`${styles.roleRow} ${selectedIds.has(character.id) ? styles.selectedRow : ""}`} key={character.id}>
                <input type="checkbox" checked={selectedIds.has(character.id)} aria-label={`选择 ${character.display_name}`} onChange={() => toggleCharacter(character.id)} />
                <span className={styles.portrait} aria-label="暂无缩略图">{character.display_name.slice(0, 1)}</span>
                <span className={styles.roleIdentity}><Link href={`/characters/${encodeURIComponent(character.id)}`}>{character.display_name}</Link><code>{character.id}</code><small>内容 v{character.content_version} · Prompt v{character.prompt_version}</small></span>
                {viewMode === "persona" ? <>
                  <span className={styles.persona}><strong>人设摘要待内容接口</strong><small>当前列表仅返回公开元数据</small></span>
                  <span className={styles.statusStack}><i className={character.status === "active" ? styles.good : character.status === "takedown" ? styles.warn : ""}>{statusLabel(character.status)}</i><i>{character.content_rating} · {character.visibility}</i></span>
                  <time dateTime={character.updated_at}>{formatDate(character.updated_at)}</time>
                </> : <>
                  <span className={styles.metric}><strong>--</strong><small>连接数</small></span>
                  <span className={styles.metric}><strong>{character.stats.interaction_count.toLocaleString("zh-CN")}</strong><small>{character.stats.like_count.toLocaleString("zh-CN")} 赞 · {character.stats.favorite_count.toLocaleString("zh-CN")} 收藏</small></span>
                  <span className={styles.metric}><strong>--</strong><small>总曝光</small></span>
                  <span className={styles.metric}><strong>--</strong><small>总点击</small></span>
                </>}
              </div>
            ))}
            {hasMore && <div className={styles.loadMore}><button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore && <LoaderCircle className={styles.spin} size={13} />}加载更多</button></div>}
            {loadError && characters.length > 0 && <p className={styles.inlineError}>{loadError}</p>}
          </section>

          <section className={styles.composer} aria-labelledby="adjust-characters-title">
            <div className={styles.composerHeader}><div><span>AI ADJUST</span><h2 id="adjust-characters-title">调整选中角色</h2></div><strong>{selectedIds.size} 个已选择</strong></div>
            <textarea value={instruction} disabled={selectedIds.size === 0} placeholder={selectedIds.size === 0 ? "先勾选一个或多个角色" : "例如：增加一个设定：内心希望得到他人认可，但不会直接承认。"} aria-label="角色调整需求" onChange={(event) => { setInstruction(event.target.value); setPreview(null); }} />
            <div className={styles.composerActions}><p>对每个角色分别生成修改方案，应用前还需确认字段差异。</p><button type="button" disabled={selectedIds.size === 0 || !instruction.trim()} onClick={createPreview}><Sparkles size={14} />生成调整预览</button></div>
            {preview && <div className={styles.preview} role="status"><span>调整范围</span><strong>{preview.names.join("、")}</strong><p>{preview.instruction}</p><small>调整请求已形成；当前尚未修改线上角色。</small></div>}
          </section>
        </>
      )}
    </section>
  );
}

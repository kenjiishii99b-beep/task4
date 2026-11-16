"use client";

import { useEffect, useId, useRef, useState } from "react";
import { search, type GraphIndex, type SearchHit } from "@/lib/graph";
import { Avatar, CategoryBadge, SearchIcon } from "../ui";

const normalize = (s: string) => s.toLowerCase().replace(/[\s　]+/g, "");

/** 検索で何も見つからなかったときの表示（検索欄のドロップダウン・人物一覧で共通） */
export function NoResults({ query, hint = "氏名・会社名・タグ名・案件名の一部で探せます。" }: { query: string; hint?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-sub" aria-hidden>
        <SearchIcon className="h-5 w-5" />
      </span>
      <p className="text-base font-semibold text-fg">No results found</p>
      <p className="text-sm text-sub">
        「<span className="text-fg">{query.trim()}</span>」に一致するものはありません
      </p>
      <p className="text-xs text-sub/80">{hint}</p>
    </div>
  );
}

interface Props {
  /** null の間は候補を出せない（データ読み込み中） */
  index: GraphIndex | null;
  value: string;
  onChange: (v: string) => void;
  onPick: (hit: SearchHit) => void;
  /** データの読み込みに失敗したときなど、候補を出せない理由 */
  unavailableMessage?: string | null;
  /** 最初から候補を開いておく（他の画面から検索語を引き継いだとき） */
  defaultOpen?: boolean;
  placeholder?: string;
  size?: "md" | "lg";
  /** 入力欄の右端に置く部品（音声入力ボタンなど） */
  trailing?: React.ReactNode;
  onFocus?: () => void;
  /** この値が変わると候補を開く（音声入力の結果を入れたときなど） */
  openSignal?: number;
}

export function SearchBox({
  index,
  value,
  onChange,
  onPick,
  unavailableMessage,
  defaultOpen = false,
  placeholder = "人・タグ・案件を探す",
  size = "md",
  trailing,
  onFocus,
  openSignal = 0,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // ↑↓キーで選んだ候補の位置。-1 は「どれも選んでいない」
  const [active, setActive] = useState(-1);
  // 候補を選ばずに確定（Enter）した検索語。この語のままなら No results found を出す
  const [submitted, setSubmitted] = useState<string | null>(null);
  // 音声入力や他画面からの引き継ぎなど、入力が確定済みの状態で開いたか
  const [autoConfirmed, setAutoConfirmed] = useState(defaultOpen);
  const [seenSignal, setSeenSignal] = useState(openSignal);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    setOpen(true);
    setActive(-1);
    setSubmitted(null);
    setAutoConfirmed(true);
  }
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const query = value.trim();
  const hits = index && query ? search(index, value, 20) : [];

  // 検索欄の外を押したら閉じる（defaultOpen で開いたときはフォーカスがないため blur では閉じられない）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (h: SearchHit) => {
    onPick(h);
    onChange(h.label);
    setOpen(false);
    setSubmitted(null);
    setAutoConfirmed(false);
  };

  // Enter で確定：選んだ候補（または名前が完全に一致する候補）があれば開き、なければ No results found
  const confirm = () => {
    if (!query) return;
    const chosen = active >= 0 ? hits[active] : undefined;
    const exact = hits.find((h) => normalize(h.label) === normalize(query));
    const target = chosen ?? exact;
    if (target) return pick(target);
    setSubmitted(query);
    setOpen(true);
  };

  const showNoResults = !!index && ((submitted !== null && submitted === query) || (autoConfirmed && hits.length === 0));
  const showHits = !!index && hits.length > 0;
  const showLoading = !index && (autoConfirmed || submitted !== null || query.length > 0);
  const showPanel = open && !!query && (showNoResults || showHits || showLoading);
  const activeId = active >= 0 && hits[active] ? `${listId}-${hits[active].id}` : undefined;

  return (
    <div ref={wrapRef} className="relative w-full">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sub">
        <SearchIcon />
      </span>
      <input
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={showPanel ? activeId : undefined}
        aria-autocomplete="list"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
          setSubmitted(null);
          setAutoConfirmed(false);
        }}
        onFocus={() => {
          setOpen(true);
          onFocus?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            // IME の変換確定の Enter では検索を確定しない
            if (e.nativeEvent.isComposing) return;
            confirm();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`field pl-9 ${size === "lg" ? "h-12" : "h-10"} ${trailing ? "pr-12" : ""}`}
      />
      {trailing && <div className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</div>}

      {showPanel && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          {showLoading ? (
            <p role="status" className="px-3 py-3 text-sm text-sub">
              {unavailableMessage ?? "候補を読み込んでいます…"}
            </p>
          ) : (
            <>
              {showNoResults && (
                <NoResults query={value} hint={hits.length > 0 ? "近い候補がある場合は、下から選んでください。" : undefined} />
              )}
              {showHits && (
                <>
                  <p className={`border-b border-line px-3 py-1.5 text-xs text-sub ${showNoResults ? "border-t" : ""}`} aria-live="polite">
                    {showNoResults ? `近い候補 ${hits.length}件` : `候補 ${hits.length}件`}
                  </p>
                  <ul id={listId} role="listbox" aria-label="検索の候補" className={`overflow-y-auto py-1 ${showNoResults ? "max-h-52" : "max-h-80"}`}>
                    {hits.map((h, i) => (
                      <li key={h.id} id={`${listId}-${h.id}`} role="option" aria-selected={i === active}>
                        <button
                          type="button"
                          tabIndex={-1}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pick(h)}
                          className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left ${i === active ? "bg-card" : "hover:bg-card"}`}
                        >
                          {h.kind === "person" ? <Avatar text={h.label[0]} size={26} /> : <CategoryBadge category={h.category!} size="xs" />}
                          <span className="min-w-0">
                            <span className="block text-sm">{h.label}</span>
                            <span className="block truncate text-xs text-sub">{h.sub}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

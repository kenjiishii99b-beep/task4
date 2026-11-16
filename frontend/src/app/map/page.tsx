"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailView, type DetailActions } from "@/components/map/DetailView";
import { GraphCanvas } from "@/components/map/GraphCanvas";
import { MemoModal, type MemoModalState } from "@/components/map/MemoModal";
import { NoResults, SearchBox } from "@/components/map/SearchBox";
import { Avatar, ErrorBanner, Spinner } from "@/components/ui";
import { useViewMode } from "@/components/ViewMode";
import { api } from "@/lib/api";
import { CATEGORIES, CATEGORY_IDS, CATEGORY_TEXT, MOBILE_FRONT_CATEGORIES } from "@/lib/categories";
import { buildIndex, formatDate, initialVisible, neighbors, search, type GraphIndex } from "@/lib/graph";
import type { CategoryId, GraphData } from "@/lib/types";

const DEFAULT_CENTER = "p-tanaka";

export default function MapPage() {
  const { isMobile } = useViewMode();
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.graph());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const index = useMemo(() => (data ? buildIndex(data) : null), [data]);

  if (error && !index) {
    return (
      <main className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 px-6">
        <ErrorBanner>人物マップのデータを読み込めませんでした：{error}</ErrorBanner>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="btn-secondary">
            再読み込み
          </button>
          <Link href="/" className="btn-ghost">
            ← ホーム
          </Link>
        </div>
      </main>
    );
  }
  if (!index) {
    return (
      <main className="flex h-full items-center justify-center">
        <Spinner label="人物マップを読み込んでいます…" />
      </main>
    );
  }
  return <MapScreen key={isMobile ? "m" : "pc"} index={index} isMobile={isMobile} reload={load} />;
}

// ---------------- 表示状態（永続データとは分離） ----------------

function useMapState(index: GraphIndex, isMobile: boolean) {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [categories, setCategories] = useState<Set<CategoryId>>(new Set()); // 空 = すべて
  const [query, setQuery] = useState("");
  const [fromQuery, setFromQuery] = useState(false);
  const [ready, setReady] = useState(false);

  const expand = useCallback(
    (id: string) =>
      setVisible((v) => {
        const next = new Set(v);
        next.add(id);
        neighbors(index, id).forEach((n) => next.add(n));
        return next;
      }),
    [index],
  );

  const select = useCallback(
    (id: string) => {
      setHistory((h) => (h[h.length - 1] === id ? h : [...h, id]));
      expand(id);
    },
    [expand],
  );

  const back = useCallback(() => setHistory((h) => h.slice(0, -1)), []);

  // 初期表示：?select= はそのノードを選択、?q= は検索欄に候補（または No results found）を開いて見せる。
  // ?q= のときは勝手に選択せず、先頭の候補の周辺だけを背景として表示する。
  useEffect(() => {
    if (ready) return;
    const params = new URLSearchParams(window.location.search);
    const selectParam = params.get("select") ?? "";
    const q = (params.get("q") ?? "").trim();
    const selectValid = index.person.has(selectParam) || index.tag.has(selectParam);
    const firstHit = !selectValid && q ? search(index, q)[0]?.id : undefined;
    const start = selectValid ? selectParam : (firstHit ?? DEFAULT_CENTER);
    const v = initialVisible(index, start, isMobile ? 4 : 6, isMobile ? 5 : 7);
    v.add(start);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(v);
    setQuery(q);
    setFromQuery(!selectValid && !!q);
    setHistory(selectValid || !q ? [start] : []);
    setReady(true);
  }, [index, isMobile, ready]);

  // データ再読込で消えたノード（削除されたタグなど）を除く
  const liveVisible = useMemo(() => new Set([...visible].filter((id) => index.person.has(id) || index.tag.has(id))), [visible, index]);

  const toggleCategory = (cat: CategoryId | "all") => {
    if (cat === "all") return applyCategories(new Set());
    const next = new Set(categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    applyCategories(next);
  };

  // 絞り込んだカテゴリーのタグは、表示中の人物につながるものをマップに追加する
  const applyCategories = (next: Set<CategoryId>) => {
    setCategories(next);
    if (next.size === 0) return;
    setVisible((v) => {
      const out = new Set(v);
      for (const id of v) {
        if (!index.person.has(id)) continue;
        for (const pt of index.tagsOfPerson.get(id) ?? []) {
          const t = index.tag.get(pt.tagId);
          if (t && next.has(t.category)) out.add(t.id);
        }
      }
      return out;
    });
  };

  const hidden = useMemo(() => new Set(categories.size === 0 ? [] : CATEGORY_IDS.filter((c) => !categories.has(c))), [categories]);
  const selectedId = history[history.length - 1] ?? null;

  return { visible: liveVisible, selectedId, history, select, back, categories, hidden, toggleCategory, applyCategories, query, setQuery, ready, fromQuery };
}

type MapState = ReturnType<typeof useMapState>;

function MapScreen({ index, isMobile, reload }: { index: GraphIndex; isMobile: boolean; reload: () => Promise<void> }) {
  const state = useMapState(index, isMobile);
  const [memo, setMemo] = useState<MemoModalState>(null);
  const actions = {
    onNavigate: state.select,
    onOpenMemo: (memoId: string) => setMemo({ mode: "view", memoId }),
    onNewMemo: (personId: string) => setMemo({ mode: "new", personId }),
    onReload: reload,
  };
  const closeMemo = useCallback(() => setMemo(null), []);

  return (
    <>
      {isMobile ? <MobileMap index={index} state={state} actions={actions} /> : <PcMap index={index} state={state} actions={actions} />}
      {memo && <MemoModal index={index} state={memo} onClose={closeMemo} onChanged={reload} />}
    </>
  );
}

type Actions = DetailActions;

function CategoryChip({ active, label, color, onClick }: { active: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs ${active ? "border-transparent" : "border-line text-sub hover:text-fg"}`}
      style={active ? { background: color ?? "#F2F2F4", color: CATEGORY_TEXT } : undefined}
    >
      {color && !active && <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />}
      {label}
    </button>
  );
}

// ---------------- PC 版（2 カラム固定） ----------------

function PcMap({ index, state, actions }: { index: GraphIndex; state: MapState; actions: Actions }) {
  const router = useRouter();
  const { setMode } = useViewMode();
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/" className="btn-ghost">
            ← ホーム
          </Link>
          <h1 className="font-medium">人物マップ</h1>
        </div>
        <div className="mx-auto w-full max-w-md">
          {state.ready && (
            <SearchBox index={index} value={state.query} onChange={state.setQuery} onPick={(h) => state.select(h.id)} defaultOpen={state.fromQuery} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setMode("mobile")} className="btn-ghost">
            📱 スマホ表示プレビュー
          </button>
          <button type="button" onClick={() => router.push("/record/")} className="btn-secondary min-h-9">
            音声メモ
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2" role="group" aria-label="カテゴリーで絞り込む">
            <CategoryChip active={state.categories.size === 0} label="すべて" onClick={() => state.toggleCategory("all")} />
            {CATEGORY_IDS.map((c) => (
              <CategoryChip key={c} active={state.categories.has(c)} label={CATEGORIES[c].label} color={CATEGORIES[c].color} onClick={() => state.toggleCategory(c)} />
            ))}
            <Legend />
          </div>
          <div className="min-h-0 flex-1">
            <GraphCanvas index={index} visible={state.visible} hiddenCategories={state.hidden} selectedId={state.selectedId} onSelect={state.select} />
          </div>
        </div>

        <aside className="flex w-[410px] shrink-0 flex-col border-l border-line bg-panel" aria-label="詳細">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {state.history.length > 1 && (
              <button type="button" onClick={state.back} className="btn-ghost mb-3 -ml-2">
                ← 前の表示へ戻る
              </button>
            )}
            {state.selectedId ? (
              <DetailView index={index} id={state.selectedId} filterActive={state.categories.size > 0} {...actions} />
            ) : (
              <EmptyDetail onNewMemo={() => actions.onNewMemo("")} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="ml-auto flex items-center gap-3 text-[11px] text-sub" aria-label="線の見方">
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden>
          <line x1="0" y1="3" x2="22" y2="3" stroke="#B5B8C1" strokeWidth="1.6" />
        </svg>
        直接の関係
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden>
          <line x1="0" y1="3" x2="22" y2="3" stroke="#8A8E98" strokeWidth="1.6" strokeDasharray="4 3" />
        </svg>
        面識は未確認
      </span>
    </div>
  );
}

function EmptyDetail({ onNewMemo }: { onNewMemo: () => void }) {
  return (
    <div className="flex flex-col gap-3 py-8 text-sm text-sub">
      <p>マップの人物・タグ・案件を選ぶと、ここに詳細が出ます。</p>
      <button type="button" onClick={onNewMemo} className="btn-secondary self-start">
        テキストでメモを追加
      </button>
    </div>
  );
}

// ---------------- スマホ版（ボトムシート＋3 タブ） ----------------

type Tab = "map" | "people" | "memos";

function MobileMap({ index, state, actions }: { index: GraphIndex; state: MapState; actions: Actions }) {
  const [tab, setTab] = useState<Tab>("map");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [draftCats, setDraftCats] = useState<Set<CategoryId>>(new Set());
  const [peopleQuery, setPeopleQuery] = useState("");

  const selected = state.selectedId;
  const selectedPerson = selected ? index.person.get(selected) : undefined;
  const otherCount = [...state.categories].filter((c) => !MOBILE_FRONT_CATEGORIES.includes(c)).length;

  // 人物はマップ上で選択（下部カードに表示）、タグ・案件はそのままシートで開く
  const onMapSelect = (id: string) => {
    state.select(id);
    if (!index.person.has(id)) setSheetOpen(true);
  };
  const openDetail = (id: string) => {
    state.select(id);
    setSheetOpen(true);
  };
  const sheetActions = { ...actions, onNavigate: openDetail };

  const people = index.data.persons.filter((p) => `${p.name}${p.company}${p.deptTitle}`.replace(/\s/g, "").includes(peopleQuery.replace(/\s/g, "")));
  const memos = [...index.data.memos].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex flex-col gap-2 border-b border-line bg-panel px-3 pt-2.5 pb-2">
        <div className="flex items-center justify-between">
          <Link href="/" className="btn-ghost -ml-1 min-h-11">
            ← ホーム
          </Link>
          <h1 className="font-medium">人物マップ</h1>
          <span className="w-16" />
        </div>
        {state.ready && (
          <SearchBox index={index} value={state.query} onChange={state.setQuery} onPick={(h) => openDetail(h.id)} defaultOpen={state.fromQuery} />
        )}
        {tab === "map" && (
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5" role="group" aria-label="カテゴリーで絞り込む">
            <CategoryChip active={state.categories.size === 0} label="すべて" onClick={() => state.toggleCategory("all")} />
            {MOBILE_FRONT_CATEGORIES.map((c) => (
              <CategoryChip key={c} active={state.categories.has(c)} label={CATEGORIES[c].label} color={CATEGORIES[c].color} onClick={() => state.toggleCategory(c)} />
            ))}
            <CategoryChip
              active={otherCount > 0}
              label={otherCount > 0 ? `その他（${otherCount}）` : "その他"}
              onClick={() => {
                setDraftCats(new Set(state.categories));
                setCatSheet(true);
              }}
            />
          </div>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        {tab === "map" && (
          <>
            <GraphCanvas
              index={index}
              visible={state.visible}
              hiddenCategories={state.hidden}
              selectedId={selected}
              onSelect={onMapSelect}
              compact
              bottomInset={selectedPerson ? 128 : 0}
            />
            {selectedPerson && (
              <div className="absolute right-3 bottom-3 left-3 flex flex-col gap-2 rounded-xl border border-line bg-panel p-3 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <Avatar text={selectedPerson.shortName} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{selectedPerson.name}</p>
                    <p className="truncate text-xs text-sub">
                      {selectedPerson.company}・{selectedPerson.deptTitle}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-sub">{selectedPerson.summary}</p>
                <button type="button" onClick={() => setSheetOpen(true)} className="btn-primary min-h-10">
                  この人をひらく
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => actions.onNewMemo(selectedPerson?.id ?? "")}
              className="absolute right-4 flex h-12 items-center gap-1 rounded-full bg-mic px-4 text-sm font-medium text-white shadow-lg"
              style={{ bottom: selectedPerson ? 156 : 16 }}
            >
              ＋ メモ
            </button>
          </>
        )}

        {tab === "people" && (
          <div className="flex h-full flex-col">
            <div className="p-3">
              <input value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} placeholder="氏名・会社名で絞り込む" aria-label="人物を絞り込む" className="field" />
            </div>
            <ul className="flex-1 overflow-y-auto px-3 pb-3">
              <li className="pb-1 text-xs text-sub" aria-live="polite">
                {peopleQuery.trim() ? `${people.length}件の候補（全${index.data.persons.length}名）` : `全${index.data.persons.length}名`}
              </li>
              {people.length === 0 && (
                <li>
                  <NoResults query={peopleQuery} hint="氏名・会社名・部署の一部で探せます。" />
                </li>
              )}
              {people.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => openDetail(p.id)} className="flex min-h-14 w-full items-center gap-3 border-b border-line text-left">
                    <Avatar text={p.shortName} size={34} />
                    <span className="min-w-0">
                      <span className="block text-sm">{p.name}</span>
                      <span className="block truncate text-xs text-sub">
                        {p.company}・{p.deptTitle}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "memos" && (
          <div className="flex h-full flex-col">
            <div className="p-3">
              <button type="button" onClick={() => actions.onNewMemo(selectedPerson?.id ?? "")} className="btn-primary w-full">
                テキストでメモを登録
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto px-3 pb-3">
              {memos.map((m) => {
                const p = index.person.get(m.personId);
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => actions.onOpenMemo(m.id)} className="flex w-full flex-col gap-1 border-b border-line py-3 text-left">
                      <span className="flex items-center gap-2 text-xs text-sub">
                        <span className="text-sm text-fg">{p?.name ?? "不明"}</span>
                        {formatDate(m.date)}
                        <span className="ml-auto">{m.confirmedByRegistrar ? "確認済み" : "確認待ち"}</span>
                      </span>
                      <span className="line-clamp-2 text-sm leading-relaxed">{m.quote || m.interpretation}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <nav className="grid grid-cols-3 border-t border-line bg-panel" aria-label="画面の切替">
        {(
          [
            ["map", "マップ"],
            ["people", "人物"],
            ["memos", "メモ"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
            className={`min-h-14 text-sm ${tab === t ? "font-medium text-fg" : "text-sub"}`}
          >
            <span className={`mx-auto mb-1 block h-0.5 w-8 rounded ${tab === t ? "bg-fg" : "bg-transparent"}`} aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {/* 詳細ボトムシート */}
      {sheetOpen && selected && (
        <BottomSheet onClose={() => setSheetOpen(false)} label="詳細">
          {state.history.length > 1 && (
            <button type="button" onClick={state.back} className="btn-ghost mb-2 -ml-2">
              ← 前の表示へ戻る
            </button>
          )}
          <DetailView index={index} id={selected} filterActive={state.categories.size > 0} {...sheetActions} />
        </BottomSheet>
      )}

      {/* 全 6 カテゴリー選択シート */}
      {catSheet && (
        <BottomSheet onClose={() => setCatSheet(false)} label="カテゴリーを選ぶ">
          <h2 className="mb-3 font-medium">カテゴリーで絞り込む</h2>
          <div className="flex flex-col">
            {CATEGORY_IDS.map((c) => (
              <label key={c} className="flex min-h-12 items-center gap-3 border-b border-line">
                <input
                  type="checkbox"
                  checked={draftCats.has(c)}
                  onChange={() => {
                    const next = new Set(draftCats);
                    if (next.has(c)) next.delete(c);
                    else next.add(c);
                    setDraftCats(next);
                  }}
                  className="h-5 w-5 accent-[#7CC8F8]"
                />
                <span className="h-3 w-3 rounded-full" style={{ background: CATEGORIES[c].color }} aria-hidden />
                <span className="text-sm">{CATEGORIES[c].label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setDraftCats(new Set())} className="btn-secondary flex-1">
              すべて表示
            </button>
            <button
              type="button"
              onClick={() => {
                state.applyCategories(draftCats);
                setCatSheet(false);
              }}
              className="btn-primary flex-1"
            >
              適用
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function BottomSheet({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()} className="sheet-enter flex max-h-[85%] flex-col rounded-t-2xl border-t border-line bg-panel">
        <div className="flex items-center justify-between px-4 pt-2">
          <span className="mx-auto h-1 w-10 rounded-full bg-line" aria-hidden />
        </div>
        <div className="flex justify-end px-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            閉じる
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

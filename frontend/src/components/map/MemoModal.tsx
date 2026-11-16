"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { CATEGORIES, CATEGORY_IDS, CATEGORY_TEXT } from "@/lib/categories";
import { formatDate, type GraphIndex } from "@/lib/graph";
import type { AssignedTag } from "@/lib/types";
import { CategoryBadge, ErrorBanner, Spinner } from "../ui";

export type MemoModalState = { mode: "view"; memoId: string } | { mode: "new"; personId: string | null } | null;

interface Props {
  index: GraphIndex;
  state: NonNullable<MemoModalState>;
  onClose: () => void;
  /** データを変更したあと（グラフを再読込する） */
  onChanged: () => Promise<void> | void;
}

export function MemoModal({ index, state, onClose, onChanged }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="memo-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter flex max-h-[88%] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-panel sm:rounded-2xl"
      >
        {state.mode === "view" ? (
          <MemoView index={index} memoId={state.memoId} onClose={onClose} onChanged={onChanged} />
        ) : (
          <NewMemo index={index} personId={state.personId} onClose={onClose} onChanged={onChanged} />
        )}
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3">
      <h2 id="memo-title" className="font-medium">
        {title}
      </h2>
      <button type="button" onClick={onClose} className="btn-ghost" aria-label="閉じる">
        閉じる
      </button>
    </div>
  );
}

// ---------------- 根拠メモ詳細 ----------------

function MemoView({ index, memoId, onClose, onChanged }: { index: GraphIndex; memoId: string; onClose: () => void; onChanged: Props["onChanged"] }) {
  const memo = index.memo.get(memoId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!memo) {
    return (
      <>
        <Header title="根拠のメモ" onClose={onClose} />
        <p className="p-4 text-sm text-sub">メモが見つかりません。</p>
      </>
    );
  }
  const person = index.person.get(memo.personId);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.confirmMemo(memo.id);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title="根拠のメモ" onClose={onClose} />
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <p className="text-sm text-sub">
          {person?.name ?? "不明な人物"}／{formatDate(memo.date)}／{memo.context}／登録者：{memo.registrar}
        </p>
        <div className="rounded-lg border border-line p-3">
          <p className="section-title">本人の発言（原文）</p>
          <p className="text-sm leading-relaxed">{memo.quote || "（記録なし）"}</p>
        </div>
        <div className="rounded-lg border border-dashed border-line p-3">
          <p className="section-title">登録者の解釈</p>
          <p className="text-sm leading-relaxed">{memo.interpretation || "（記録なし）"}</p>
        </div>
        {memo.tagIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {memo.tagIds.map((tid) => {
              const t = index.tag.get(tid);
              return t ? (
                <span key={tid} className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-1 text-xs">
                  <CategoryBadge category={t.category} size="xs" />
                  {t.label}
                </span>
              ) : null;
            })}
          </div>
        )}
        <dl className="grid grid-cols-[6em_1fr] gap-y-1.5 text-sm">
          <dt className="text-sub">ステータス</dt>
          <dd>{memo.confirmedByRegistrar ? "登録者確認済み" : "登録者の確認待ち"}</dd>
          <dt className="text-sub">共有範囲</dt>
          <dd>{memo.scope}</dd>
        </dl>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {!memo.confirmedByRegistrar && (
          <button type="button" onClick={confirm} disabled={busy} className="btn-primary">
            登録者確認済みとして反映
          </button>
        )}
      </div>
    </>
  );
}

// ---------------- 新規テキストメモ登録 ----------------

function NewMemo({ index, personId, onClose, onChanged }: { index: GraphIndex; personId: string | null; onClose: () => void; onChanged: Props["onChanged"] }) {
  const [pid, setPid] = useState(personId ?? "");
  const [quote, setQuote] = useState("");
  const [interp, setInterp] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newSuggestions, setNewSuggestions] = useState<AssignedTag[]>([]);
  const [acceptedNew, setAcceptedNew] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const person = index.person.get(pid);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const suggest = async () => {
    setSuggesting(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.autoTag({ company: person?.company ?? "", personName: person?.name ?? "", quote, interpretation: interp });
      const existing = r.assignedTags.filter((t) => t.tagId);
      setSelected(new Set([...selected, ...existing.map((t) => t.tagId!)]));
      setNewSuggestions(r.assignedTags.filter((t) => !t.tagId));
      setAcceptedNew(new Set(r.assignedTags.filter((t) => !t.tagId).map((t) => t.label)));
      if (r.assignedTags.length === 0) setNotice("提案できるタグが見つかりませんでした。下の一覧から選んでください。");
      else if (r.mode === "mock") setNotice("OpenAI API キー未設定のため、既存タグとのキーワード一致で提案しました。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pid) return setError("人物を選んでください。");
    if (!quote.trim() && !interp.trim()) return setError("発言内容か解釈のどちらかを入力してください。");
    setSaving(true);
    setError(null);
    try {
      await api.createMemo({ personId: pid, quote: quote.trim(), interpretation: interp.trim(), tagIds: [...selected] });
      for (const t of newSuggestions.filter((t) => acceptedNew.has(t.label))) {
        await api.addPersonTag({ personId: pid, label: t.label, category: t.category, reason: t.reason });
      }
      await onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <Header title="テキストメモを登録" onClose={onClose} />
      <form onSubmit={save} className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="memo-person" className="text-xs text-sub">
            対象人物
          </label>
          <select id="memo-person" value={pid} onChange={(e) => setPid(e.target.value)} className="field">
            <option value="">選んでください</option>
            {index.data.persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.company}）
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="memo-quote" className="text-xs text-sub">
            本人の発言（原文）
          </label>
          <textarea id="memo-quote" rows={3} value={quote} onChange={(e) => setQuote(e.target.value)} className="field leading-relaxed" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="memo-interp" className="text-xs text-sub">
            登録者の解釈
          </label>
          <textarea id="memo-interp" rows={3} value={interp} onChange={(e) => setInterp(e.target.value)} className="field leading-relaxed" />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex w-full items-center justify-between text-xs text-sub">
            <span>タグ（{selected.size + acceptedNew.size}件選択中）</span>
          </legend>
          <button type="button" onClick={suggest} disabled={suggesting || (!quote.trim() && !interp.trim())} className="btn-secondary self-start text-xs">
            OpenAI API でタグを提案
          </button>
          {suggesting && <Spinner label="タグを提案しています…" />}
          {notice && <p className="text-xs text-sub">{notice}</p>}
          {newSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {newSuggestions.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  aria-pressed={acceptedNew.has(t.label)}
                  onClick={() => setAcceptedNew(toggle(acceptedNew, t.label))}
                  className={`rounded-full border px-2.5 py-1 text-xs ${acceptedNew.has(t.label) ? "border-fg" : "border-dashed border-line text-sub"}`}
                >
                  新規：{t.label}（{CATEGORIES[t.category].label}）
                </button>
              ))}
            </div>
          )}
          {CATEGORY_IDS.map((cat) => {
            const tags = index.data.tags.filter((t) => t.category === cat);
            if (tags.length === 0) return null;
            return (
              <div key={cat} className="flex flex-col gap-1">
                <span className="text-[11px] text-sub">{CATEGORIES[cat].label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const on = selected.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSelected(toggle(selected, t.id))}
                        className={`min-h-8 rounded-full px-2.5 text-xs ${on ? "" : "border border-line text-sub hover:text-fg"}`}
                        style={on ? { background: CATEGORIES[cat].color, color: CATEGORY_TEXT } : undefined}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </fieldset>

        {error && <ErrorBanner>{error}</ErrorBanner>}
        <button type="submit" disabled={saving} className="btn-primary">
          メモを登録
        </button>
      </form>
    </>
  );
}

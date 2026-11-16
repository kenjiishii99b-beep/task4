"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, CategoryBadge, ErrorBanner } from "@/components/ui";
import { api } from "@/lib/api";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import { flow } from "@/lib/flow";
import type { CategoryId, KnowledgeResult, RegisteredTag } from "@/lib/types";

export default function TaggingPage() {
  const router = useRouter();
  const [result, setResult] = useState<KnowledgeResult | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<CategoryId>("interest");
  const [newReason, setNewReason] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(flow.getResult());
  }, []);

  if (result === undefined) return null;
  if (!result) {
    return (
      <main className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sub">表示できる登録結果がありません。</p>
        <Link href="/" className="btn-secondary">
          ホームへ戻る
        </Link>
      </main>
    );
  }

  const update = (tags: RegisteredTag[]) => {
    const next = { ...result, assignedTags: tags };
    setResult(next);
    flow.setResult(next);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const changeCategory = (t: RegisteredTag, category: CategoryId) =>
    run(t.personTagId, async () => {
      await api.updatePersonTag(t.personTagId, { detailRole: category });
      update(result.assignedTags.map((x) => (x.personTagId === t.personTagId ? { ...x, detailRole: category, category: x.isNewTag ? category : x.category } : x)));
    });

  const remove = (t: RegisteredTag) =>
    run(t.personTagId, async () => {
      await api.deletePersonTag(t.personTagId);
      update(result.assignedTags.filter((x) => x.personTagId !== t.personTagId));
    });

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    run("add", async () => {
      const r = await api.addPersonTag({ personId: result.person.id, label: newLabel.trim(), category: newCategory, reason: newReason.trim() });
      update([...result.assignedTags.filter((x) => x.personTagId !== r.personTagId), r]);
      setNewLabel("");
      setNewReason("");
    });
  };

  const p = result.person;

  return (
    <main className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-5 py-6">
        <div>
          <h1 className="text-lg leading-relaxed font-medium">登録完了しました。お疲れ様でした。</h1>
          <p className="mt-1 text-sm text-sub">
            {result.mode === "openai"
              ? "OpenAI API により以下のタグを自動付与しました。"
              : "以下のタグを自動付与しました（OpenAI API キー未設定のため、既存タグとのキーワード一致で判定しています）。"}
          </p>
        </div>

        <section className="rounded-xl border border-line bg-panel p-4" aria-label="対象人物">
          <div className="flex items-center gap-3">
            <Avatar text={p.shortName} size={44} />
            <div className="min-w-0">
              <p className="font-medium">
                {p.name}
                {result.isNewPerson && <span className="ml-2 rounded bg-card px-1.5 py-0.5 text-[11px] text-sub">新規登録</span>}
              </p>
              <p className="truncate text-sm text-sub">{[p.company, p.deptTitle].filter(Boolean).join("・") || "所属未登録"}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="tags-heading" className="flex flex-col gap-3">
          <h2 id="tags-heading" className="section-title">
            付与されたタグ（{result.assignedTags.length}件）
          </h2>
          {result.assignedTags.length === 0 && (
            <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-sub">
              自動で付けられるタグが見つかりませんでした。下のフォームから追加できます。
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {result.assignedTags.map((t) => (
              <li key={t.personTagId} className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={t.category} />
                  <span className="font-medium">{t.label}</span>
                  <span className="text-xs text-sub">{t.isNewTag ? "新しく作成したタグ" : "既存の共通テーマへ名寄せ"}</span>
                </div>
                {t.reason && <p className="text-sm text-sub">理由：{t.reason}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-sub" htmlFor={`role-${t.personTagId}`}>
                    この人にとっては
                  </label>
                  <select
                    id={`role-${t.personTagId}`}
                    value={t.detailRole}
                    disabled={busy === t.personTagId}
                    onChange={(e) => changeCategory(t, e.target.value as CategoryId)}
                    className="field w-auto py-1.5 text-xs"
                  >
                    {CATEGORY_IDS.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORIES[c].label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => remove(t)} disabled={busy === t.personTagId} className="btn-ghost ml-auto text-xs">
                    このタグを外す
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-line p-4" aria-label="タグを追加">
          <p className="section-title mb-0">タグを追加</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="例：夜間電力のコスト削減" aria-label="タグ名" className="field sm:flex-1" />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as CategoryId)} aria-label="カテゴリー" className="field sm:w-40">
              {CATEGORY_IDS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIES[c].label}
                </option>
              ))}
            </select>
          </div>
          <input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="関わる理由（任意）" aria-label="関わる理由" className="field" />
          <button type="submit" disabled={!newLabel.trim() || busy === "add"} className="btn-secondary self-start">
            追加する
          </button>
        </form>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" onClick={() => router.push(`/map/?select=${p.id}`)} className="btn-primary sm:flex-1">
            人物マップで反映を確認する
          </button>
          <button type="button" onClick={() => router.push("/")} className="btn-secondary sm:flex-1">
            ホームへ戻る
          </button>
        </div>
      </div>
    </main>
  );
}

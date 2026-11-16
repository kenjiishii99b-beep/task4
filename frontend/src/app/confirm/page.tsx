"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBanner, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { flow, type DraftSummary } from "@/lib/flow";
import { AI_LABEL, type Summary } from "@/lib/types";

const FIELDS: { key: keyof Summary; label: string; multiline?: boolean }[] = [
  { key: "company", label: "会社名" },
  { key: "personName", label: "対象人物名" },
  { key: "dept", label: "部署" },
  { key: "position", label: "ポジション・役職" },
  { key: "quote", label: "本人の発言内容（原文メモ）", multiline: true },
  { key: "interpretation", label: "関わる理由・登録者の解釈", multiline: true },
];

export default function ConfirmPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftSummary | null | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = flow.getDraft();
    // sessionStorage はブラウザでのみ読めるため、マウント後に反映する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(d);
    setSummary(d?.summary ?? null);
  }, []);

  if (draft === undefined) return null;
  if (!draft || !summary) {
    return (
      <main className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sub">確認する要約がありません。ホームから記録をはじめてください。</p>
        <Link href="/" className="btn-secondary">
          ホームへ戻る
        </Link>
      </main>
    );
  }

  const register = async () => {
    if (!summary.personName.trim()) {
      setError("対象人物名を入力してください。「修正する」から入力できます。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.registerKnowledge(summary, draft.transcript);
      flow.setResult(result);
      router.push("/tagging/");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const toggleEdit = () => {
    if (editing) flow.setDraft({ ...draft, summary });
    setEditing(!editing);
  };

  return (
    <main className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-5 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-medium">要約の確認</h1>
            <p className="mt-1 text-sm text-sub">
              {draft.mode !== "mock" ? `${AI_LABEL[draft.mode]} が文字起こしから抽出しました。` : "AI が未設定のため、簡易抽出の結果です。"}
              内容を確認し、違うところは修正してください。
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${editing ? "bg-accent text-cat-text" : "border border-line text-sub"}`}
            aria-live="polite"
          >
            {editing ? "編集中" : "確認中"}
          </span>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
          {FIELDS.map((f) => {
            const common = {
              id: f.key,
              value: summary[f.key],
              readOnly: !editing,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSummary({ ...summary, [f.key]: e.target.value }),
              className: `field ${editing ? "border-accent" : "cursor-default border-transparent bg-card"}`,
              placeholder: editing ? "" : "（未抽出）",
            };
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label htmlFor={f.key} className="text-xs text-sub">
                  {f.label}
                </label>
                {f.multiline ? <textarea rows={3} {...common} className={`${common.className} leading-relaxed`} /> : <input type="text" {...common} />}
              </div>
            );
          })}
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => router.push("/record/")} disabled={saving} className="btn-secondary sm:flex-1">
            やり直し
          </button>
          <button type="button" onClick={toggleEdit} disabled={saving} className="btn-secondary sm:flex-1">
            {editing ? "修正を確定" : "修正する"}
          </button>
          <button type="button" onClick={register} disabled={saving || editing} className="btn-primary sm:flex-[1.4]">
            共通知に登録
          </button>
        </div>
        {editing && <p className="text-xs text-sub">登録する前に「修正を確定」を押してください。</p>}
        {saving && <Spinner label="登録して、AI でタグを付けています…" />}
      </div>
    </main>
  );
}

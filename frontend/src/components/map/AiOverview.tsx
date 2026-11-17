"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, type GraphIndex } from "@/lib/graph";
import { AI_LABEL, type Person, type PersonOverview } from "@/lib/types";

// 同じ内容の人物をもう一度開いたときは、通信せずにすぐ出す（画面を開いている間だけ保持）
const cache = new Map<string, PersonOverview>();

/** 概要の元になる情報が変わったかを判定するための署名。サーバー側でも同じ考え方で作り直しを判定している */
function signature(index: GraphIndex, person: Person): string {
  const memos = (index.memosOf.get(person.id) ?? []).map((m) => `${m.id}:${m.quote.length}:${m.interpretation.length}`);
  const tags = (index.tagsOfPerson.get(person.id) ?? []).map((pt) => `${pt.tagId}:${pt.detailRole}:${pt.reason}`);
  return [person.id, person.name, person.company, person.deptTitle, person.summary, memos.join(","), tags.join(",")].join("|");
}

type State = { status: "loading" } | { status: "done"; data: PersonOverview } | { status: "error"; message: string };

export function AiOverview({ index, person, onOpenMemo }: { index: GraphIndex; person: Person; onOpenMemo: (memoId: string) => void }) {
  const sig = signature(index, person);
  const [state, setState] = useState<State>(() => {
    const hit = cache.get(sig);
    return hit ? { status: "done", data: hit } : { status: "loading" };
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const force = reloadKey > 0;
    const hit = cache.get(sig);
    if (hit && !force) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "done", data: hit });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    api
      .personOverview(person.id, force)
      .then((data) => {
        cache.set(sig, data);
        if (alive) setState({ status: "done", data });
      })
      .catch((e: Error) => alive && setState({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [sig, person.id, reloadKey]);

  const memoById = index.memo;

  return (
    <section aria-labelledby={`ov-${person.id}`} aria-busy={state.status === "loading"} className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`ov-${person.id}`} className="text-sm font-medium">
          AIの概要
        </h3>
        <span className="text-[11px] text-sub">
          {state.status === "done" ? (state.data.mode === "mock" ? "簡易まとめ（AI 未設定）" : `${AI_LABEL[state.data.mode]} が作成`) : "AI が作成"}
        </span>
      </div>

      {state.status === "loading" && (
        <div role="status" className="flex flex-col gap-2 py-1">
          <span className="text-xs text-sub">AI がまとめています…</span>
          {[92, 80, 86].map((w) => (
            <span key={w} className="h-3 animate-pulse rounded bg-card motion-reduce:animate-none" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {state.status === "done" && (
        <>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed marker:text-accent">
            {state.data.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
            {state.data.sourceMemoIds.length > 0 && (
              <span className="flex flex-wrap items-center gap-x-2">
                根拠：
                {state.data.sourceMemoIds.map((id) => {
                  const m = memoById.get(id);
                  return m ? (
                    <button key={id} type="button" onClick={() => onOpenMemo(id)} className="text-accent underline-offset-2 hover:underline">
                      メモ {formatDate(m.date).slice(5)}
                    </button>
                  ) : null;
                })}
              </span>
            )}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="ml-auto text-sub underline-offset-2 hover:text-fg hover:underline">
              作り直す
            </button>
          </div>
        </>
      )}

      {state.status === "error" && (
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="text-xs text-sub">AI の概要を作れませんでした（{state.message}）。登録済みの要約を表示しています。</p>
          {person.summary && <p className="leading-relaxed">{person.summary}</p>}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="self-start text-xs text-accent hover:underline">
            もう一度試す
          </button>
        </div>
      )}
    </section>
  );
}

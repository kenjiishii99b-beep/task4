// 記録フロー（録音 → 要約確認 → タグ付け結果）の画面間でデータを受け渡す。
// sessionStorage が使えない環境（プライベートモード等）ではメモリに保持する。

import type { AiMode, KnowledgeResult, Summary } from "./types";

const memory = new Map<string, string>();

function read<T>(key: string): T | null {
  let raw: string | null | undefined;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch {
    raw = memory.get(key);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    window.sessionStorage.setItem(key, raw);
  } catch {
    /* メモリ保持のみ */
  }
}

export interface DraftSummary {
  transcript: string;
  summary: Summary;
  mode: AiMode;
}

export const flow = {
  getDraft: () => read<DraftSummary>("flow.draft"),
  setDraft: (d: DraftSummary) => write("flow.draft", d),
  getResult: () => read<KnowledgeResult>("flow.result"),
  setResult: (r: KnowledgeResult) => write("flow.result", r),
};

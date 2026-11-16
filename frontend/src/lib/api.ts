import type { AssignedTag, AiMode, GraphData, KnowledgeResult, Memo, Person, PersonTag, RegisteredTag, Summary } from "./types";

// 静的エクスポートのためビルド時に埋め込まれる。SWA Standard でリンクされたバックエンドにする場合は空にして相対パスで呼ぶ。
const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("サーバーに接続できません。API が起動しているか確認してください。", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : `リクエストに失敗しました（HTTP ${res.status}）`;
    throw new ApiError(detail, res.status);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data) });
const patch = <T>(path: string, data: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) });

export const api = {
  graph: () => request<GraphData>("/api/graph"),
  summarize: (transcript: string) => post<{ summary: Summary; mode: AiMode }>("/api/summarize", { transcript }),
  autoTag: (summary: Partial<Summary>) => post<{ assignedTags: AssignedTag[]; mode: AiMode }>("/api/auto-tag", summary),
  registerKnowledge: (summary: Summary, transcript: string) =>
    post<KnowledgeResult>("/api/knowledge", { summary, transcript }),
  updatePerson: (id: string, data: { name?: string; company?: string; deptTitle?: string; summary?: string }) =>
    patch<Person>(`/api/persons/${id}`, data),
  addPersonTag:(data: { personId: string; tagId?: string | null; label?: string; category: string; reason: string }) =>
    post<RegisteredTag>("/api/person-tags", data),
  updatePersonTag: (id: string, data: { detailRole?: string; reason?: string }) => patch<PersonTag>(`/api/person-tags/${id}`, data),
  deletePersonTag: (id: string) => request<void>(`/api/person-tags/${id}`, { method: "DELETE" }),
  createMemo: (data: { personId: string; quote: string; interpretation: string; tagIds: string[]; context?: string }) =>
    post<{ memo: Memo; assignedTags: RegisteredTag[] }>("/api/memos", data),
  confirmMemo: (id: string) => patch<Memo>(`/api/memos/${id}/confirm`, {}),
};

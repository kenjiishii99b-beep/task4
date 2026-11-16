import type { CategoryId, GraphData, Memo, Person, PersonRelation, PersonTag, Project, Tag } from "./types";

export interface GraphIndex {
  data: GraphData;
  person: Map<string, Person>;
  tag: Map<string, Tag>;
  projectByTag: Map<string, Project>;
  tagsOfPerson: Map<string, PersonTag[]>;
  personsOfTag: Map<string, PersonTag[]>;
  relationsOf: Map<string, PersonRelation[]>;
  memosOf: Map<string, Memo[]>;
  memo: Map<string, Memo>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export function buildIndex(data: GraphData): GraphIndex {
  const idx: GraphIndex = {
    data,
    person: new Map(data.persons.map((p) => [p.id, p])),
    tag: new Map(data.tags.map((t) => [t.id, t])),
    projectByTag: new Map(data.projects.map((p) => [p.tagId, p])),
    tagsOfPerson: new Map(),
    personsOfTag: new Map(),
    relationsOf: new Map(),
    memosOf: new Map(),
    memo: new Map(data.memos.map((m) => [m.id, m])),
  };
  for (const pt of data.personTags) {
    push(idx.tagsOfPerson, pt.personId, pt);
    push(idx.personsOfTag, pt.tagId, pt);
  }
  for (const r of data.personRelations) {
    push(idx.relationsOf, r.fromId, r);
    push(idx.relationsOf, r.toId, r);
  }
  for (const m of data.memos) push(idx.memosOf, m.personId, m);
  return idx;
}

export type NodeKind = "person" | "tag";

export function kindOf(idx: GraphIndex, id: string): NodeKind | null {
  if (idx.person.has(id)) return "person";
  if (idx.tag.has(id)) return "tag";
  return null;
}

export function neighbors(idx: GraphIndex, id: string): string[] {
  if (idx.person.has(id)) {
    const tags = (idx.tagsOfPerson.get(id) ?? []).map((pt) => pt.tagId);
    const people = (idx.relationsOf.get(id) ?? []).map((r) => (r.fromId === id ? r.toId : r.fromId));
    return [...tags, ...people];
  }
  return (idx.personsOfTag.get(id) ?? []).map((pt) => pt.personId);
}

/**
 * 初期表示に出すノードを決める。中心人物とそのタグ、共通タグ・直接の関係でつながる人物を上位から選び、
 * 選んだ人物間で共有されているタグを優先して追加する（表示密度を抑えるため）。
 */
export function initialVisible(idx: GraphIndex, centerId: string, maxPersons: number, maxTags: number): Set<string> {
  const visible = new Set<string>();
  if (!idx.person.has(centerId)) {
    if (idx.tag.has(centerId)) {
      visible.add(centerId);
      for (const pt of (idx.personsOfTag.get(centerId) ?? []).slice(0, maxPersons)) visible.add(pt.personId);
      return visible;
    }
    const first = idx.data.persons[0];
    if (!first) return visible;
    centerId = first.id;
  }

  const centerTags = new Set((idx.tagsOfPerson.get(centerId) ?? []).map((pt) => pt.tagId));
  const score = new Map<string, number>();
  for (const tagId of centerTags) {
    for (const pt of idx.personsOfTag.get(tagId) ?? []) {
      if (pt.personId !== centerId) score.set(pt.personId, (score.get(pt.personId) ?? 0) + 2);
    }
  }
  for (const r of idx.relationsOf.get(centerId) ?? []) {
    const other = r.fromId === centerId ? r.toId : r.fromId;
    score.set(other, (score.get(other) ?? 0) + (r.confirmed ? 3 : 1));
  }
  const persons = [centerId, ...[...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)].slice(0, maxPersons);
  persons.forEach((p) => visible.add(p));

  // タグ：中心人物のタグ → 表示人物間で共有されるタグ → その他の順に maxTags まで
  const tagScore = new Map<string, number>();
  for (const p of persons) {
    for (const pt of idx.tagsOfPerson.get(p) ?? []) {
      tagScore.set(pt.tagId, (tagScore.get(pt.tagId) ?? 0) + 1 + (centerTags.has(pt.tagId) ? 10 : 0));
    }
  }
  [...tagScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .forEach(([id]) => visible.add(id));
  return visible;
}

export interface SearchHit {
  id: string;
  kind: NodeKind;
  label: string;
  sub: string;
  category?: CategoryId;
}

export function search(idx: GraphIndex, q: string, limit = 8): SearchHit[] {
  const query = q.trim().toLowerCase().replace(/\s+/g, "");
  if (!query) return [];
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const hits: SearchHit[] = [];
  for (const p of idx.data.persons) {
    const hay = norm(`${p.name}${p.company}${p.deptTitle}`);
    // 「東都設備・田中部長」のような複合クエリにも当たるよう、区切りごとに判定する
    const parts = q.split(/[・\s　,、]+/).map(norm).filter(Boolean);
    if (hay.includes(query) || (parts.length > 1 && parts.every((part) => hay.includes(part) || norm(p.name).includes(part.replace(/(部長|課長|さん|様)$/, ""))))) {
      hits.push({ id: p.id, kind: "person", label: p.name, sub: `${p.company}・${p.deptTitle}` });
    }
  }
  for (const t of idx.data.tags) {
    if (norm(t.label).includes(query)) {
      const n = idx.personsOfTag.get(t.id)?.length ?? 0;
      hits.push({ id: t.id, kind: "tag", label: t.label, sub: `${n}名`, category: t.category });
    }
  }
  return hits.slice(0, limit);
}

/** 2 人の人物が共有しているタグ */
export function sharedTags(idx: GraphIndex, a: string, b: string): string[] {
  const ta = new Set((idx.tagsOfPerson.get(a) ?? []).map((pt) => pt.tagId));
  return (idx.tagsOfPerson.get(b) ?? []).map((pt) => pt.tagId).filter((t) => ta.has(t));
}

export function formatYen(amount: number | null): string {
  if (amount == null) return "未登録";
  if (amount >= 10_000) return `${(amount / 10_000).toLocaleString("ja-JP")}万円`;
  return `${amount.toLocaleString("ja-JP")}円`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "未登録";
  const d = iso.slice(0, 10).split("-");
  return `${d[0]}/${d[1]}/${d[2]}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "未同期";
  return `${formatDate(iso)} ${iso.slice(11, 16)}`;
}

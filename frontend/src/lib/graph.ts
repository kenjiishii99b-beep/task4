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

// ---------------- 検索語の解釈 ----------------

/** 検索語の解釈結果 */
export interface ParsedQuery {
  /** 実際に照合する語（質問の言い回し・役職・敬称を除いたもの） */
  term: string;
  /** 「〜ってどんな人？」のような質問の形か */
  isQuestion: boolean;
  /** 「〜のキーマンは？」の形なら true（term は会社名） */
  keyman: boolean;
}

const QUESTION_TAILS = [
  /(って|は|とは|の)?(どんな|どういう)(人|方|ひと)(ですか|なの|なん|か)?[？?]*$/,
  /(について|のこと)(を)?(教えて|知りたい)?(ください)?[？?]*$/,
  /(って|は)(誰|だれ|何者)(ですか|なの|か)?[？?]*$/,
  /とは[？?]*$/,
];
const KEYMAN_RE = /^(.*?)(?:の|で)?(キーマン|キーパーソン|決裁者|意思決定者|決定権者)(?:は|って|を|って誰|は誰|はだれ)?(?:ですか|教えて)?[？?]*$/;
const TITLES_RE = /(部長|課長|係長|工場長|室長|社長|専務|常務|所長|主任|リーダー|マネージャー|さん|様|氏|殿|くん)+$/;

const norm = (s: string) => s.toLowerCase().replace(/[\s　]+/g, "");

/** 末尾の役職・敬称を外す（外すと空になる語、例「部長」だけ、はそのまま） */
function stripTitle(s: string): string {
  const t = s.replace(TITLES_RE, "");
  return t || s;
}

export function parseQuery(q: string): ParsedQuery {
  let s = q.trim();
  const isQuestionMark = /[？?]$/.test(s);
  const km = s.match(KEYMAN_RE);
  if (km) return { term: km[1].replace(/[のでは]$/, "").trim(), isQuestion: true, keyman: true };
  let isQuestion = isQuestionMark;
  for (const re of QUESTION_TAILS) {
    if (re.test(s)) {
      s = s.replace(re, "");
      isQuestion = true;
    }
  }
  s = s.replace(/[？?！!。]+$/, "").trim();
  return { term: stripTitle(s), isQuestion, keyman: false };
}

const TITLE_RANK: [RegExp, number][] = [
  [/社長|専務|常務/, 1],
  [/部長|工場長|所長/, 2],
  [/室長|課長|グループ長/, 3],
  [/リーダー|係長|主任|マネージャー/, 4],
];

/** キーマン候補：会社名が一致する人を、意思決定者 → 役職の高い順に並べる */
function keymanSearch(idx: GraphIndex, companyTerm: string): SearchHit[] {
  const c = norm(companyTerm);
  const rows = idx.data.persons
    .filter((p) => (c ? norm(p.company).includes(c) : p.company !== "自社"))
    .map((p) => {
      const decision = idx.data.projects.find((pr) => pr.roles.some((r) => r.personId === p.id && r.role.includes("意思決定者")));
      const rank = decision ? 0 : (TITLE_RANK.find(([re]) => re.test(p.deptTitle))?.[1] ?? 9);
      const sub = decision ? `意思決定者（${decision.name}）・${p.deptTitle}` : `${p.company}・${p.deptTitle}`;
      return { p, rank, sub };
    })
    .sort((a, b) => a.rank - b.rank);
  return rows.map(({ p, sub }) => ({ id: p.id, kind: "person" as const, label: p.name, sub }));
}

export function search(idx: GraphIndex, q: string, limit = 8): SearchHit[] {
  const parsed = parseQuery(q);
  if (parsed.keyman) return keymanSearch(idx, parsed.term).slice(0, limit);

  const query = norm(parsed.term);
  if (!query) return [];
  // 「東都設備・田中部長」のような複合クエリにも当たるよう、区切りごとに判定する
  const parts = parsed.term.split(/[・\s　,、]+/).map((x) => norm(stripTitle(x))).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const p of idx.data.persons) {
    const hay = norm(`${p.name}${p.company}${p.deptTitle}`);
    if (hay.includes(query) || (parts.length > 1 && parts.every((part) => hay.includes(part)))) {
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

// API（FastAPI）の JSON と 1:1 で対応する型。キーは camelCase。

export type CategoryId = "project" | "hobby" | "interest" | "expertise" | "challenge" | "goal";

export interface Person {
  id: string;
  name: string;
  shortName: string;
  company: string;
  deptTitle: string;
  sfContactId: string | null;
  summary: string;
}

export interface Tag {
  id: string;
  category: CategoryId;
  label: string;
  projectId: string | null;
}

export interface Project {
  id: string;
  tagId: string;
  sfOpportunityId: string | null;
  name: string;
  accountName: string;
  amount: number | null;
  stage: string;
  closeDate: string | null;
  ownerId: string | null;
  lastSync: string | null;
  relatedTagIds: string[];
  sfUrl: string | null;
  roles: { personId: string; role: string }[];
}

export interface PersonTag {
  id: string;
  personId: string;
  tagId: string;
  reason: string;
  detailRole: CategoryId;
  detailLabel: string | null;
  sourceIds: string[];
}

export interface PersonRelation {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  confirmed: boolean;
}

export interface Memo {
  id: string;
  personId: string;
  date: string;
  context: string;
  registrar: string;
  quote: string;
  interpretation: string;
  confirmedByRegistrar: boolean;
  scope: string;
  tagIds: string[];
}

export interface GraphData {
  persons: Person[];
  tags: Tag[];
  projects: Project[];
  personTags: PersonTag[];
  personRelations: PersonRelation[];
  memos: Memo[];
}

export interface Summary {
  company: string;
  personName: string;
  dept: string;
  position: string;
  quote: string;
  interpretation: string;
}

export type AiMode = "azure" | "openai" | "mock";

/** 画面に出す AI の呼び名 */
export const AI_LABEL: Record<AiMode, string> = {
  azure: "Azure OpenAI",
  openai: "OpenAI API",
  mock: "簡易判定",
};

export interface AssignedTag {
  tagId: string | null;
  label: string;
  category: CategoryId;
  reason: string;
  detailRole: CategoryId;
  isNewTag: boolean;
}

export interface RegisteredTag extends AssignedTag {
  tagId: string;
  personTagId: string;
}

export interface KnowledgeResult {
  person: Person;
  memo: Memo;
  assignedTags: RegisteredTag[];
  isNewPerson: boolean;
  mode: AiMode;
}

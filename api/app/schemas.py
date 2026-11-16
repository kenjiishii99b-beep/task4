"""API の入出力 DTO。JSON は camelCase（フロントの型定義と一致させる）。"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

CategoryId = Literal["project", "hobby", "interest", "expertise", "challenge", "goal"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- 参照系 ----------


class PersonOut(CamelModel):
    id: str
    name: str
    short_name: str
    company: str
    dept_title: str
    sf_contact_id: str | None
    summary: str


class TagOut(CamelModel):
    id: str
    category: CategoryId
    label: str
    project_id: str | None = None


class ProjectRole(CamelModel):
    person_id: str
    role: str


class ProjectOut(CamelModel):
    id: str
    tag_id: str
    sf_opportunity_id: str | None
    name: str
    account_name: str
    amount: int | None
    stage: str
    close_date: date | None
    owner_id: str | None
    last_sync: datetime | None
    related_tag_ids: list[str]
    sf_url: str | None
    roles: list[ProjectRole]


class PersonTagOut(CamelModel):
    id: str
    person_id: str
    tag_id: str
    reason: str
    detail_role: CategoryId
    detail_label: str | None
    source_ids: list[str]


class PersonRelationOut(CamelModel):
    id: str
    from_id: str
    to_id: str
    label: str
    confirmed: bool


class MemoOut(CamelModel):
    id: str
    person_id: str
    date: date
    context: str
    registrar: str
    quote: str
    interpretation: str
    confirmed_by_registrar: bool
    scope: str
    tag_ids: list[str]


class GraphOut(CamelModel):
    persons: list[PersonOut]
    tags: list[TagOut]
    projects: list[ProjectOut]
    person_tags: list[PersonTagOut]
    person_relations: list[PersonRelationOut]
    memos: list[MemoOut]


# ---------- AI（要約・タグ付け） ----------


class SummarizeIn(CamelModel):
    transcript: str = Field(min_length=1, max_length=10000)


class Summary(CamelModel):
    company: str = ""
    person_name: str = ""
    dept: str = ""
    position: str = ""
    quote: str = ""
    interpretation: str = ""


class AutoTagIn(Summary):
    """要約＋（任意で）元の文字起こし"""

    transcript: str = Field(default="", max_length=10000)


class SummarizeOut(CamelModel):
    summary: Summary
    mode: Literal["azure", "openai", "mock"]


class AssignedTag(CamelModel):
    tag_id: str | None
    label: str
    category: CategoryId
    reason: str
    detail_role: CategoryId
    is_new_tag: bool


class AutoTagOut(CamelModel):
    assigned_tags: list[AssignedTag]
    mode: Literal["azure", "openai", "mock"]


# ---------- 登録系 ----------


class KnowledgeIn(CamelModel):
    summary: Summary
    transcript: str = ""
    registrar: str = "あなた"


class RegisteredTag(AssignedTag):
    person_tag_id: str


class KnowledgeOut(CamelModel):
    person: PersonOut
    memo: MemoOut
    assigned_tags: list[RegisteredTag]
    is_new_person: bool
    mode: Literal["azure", "openai", "mock"]


class PersonUpdate(CamelModel):
    """人物情報の修正。送られてきた項目だけ更新する。"""

    name: str | None = Field(default=None, max_length=100)
    company: str | None = Field(default=None, max_length=200)
    dept_title: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)


class PersonTagCreate(CamelModel):
    person_id: str
    tag_id: str | None = None
    label: str | None = Field(default=None, max_length=100)
    category: CategoryId = "interest"
    reason: str = ""


class PersonTagUpdate(CamelModel):
    detail_role: CategoryId | None = None
    reason: str | None = None


class MemoCreate(CamelModel):
    person_id: str
    quote: str = ""
    interpretation: str = ""
    context: str = "テキストメモ"
    registrar: str = "あなた"
    tag_ids: list[str] = []
    auto_tag: bool = False

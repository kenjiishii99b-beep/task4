"""ORM モデル（仕様書 4.1 のエンティティに対応）。

案件（project）はグラフ上ではタグと同じノードとして扱うため、tags テーブルに category="project" の行を持ち、
商談情報は projects テーブル（tag_id で 1:1）に保持する。
"""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    short_name: Mapped[str] = mapped_column(String(10))
    company: Mapped[str] = mapped_column(String(200), default="")
    dept_title: Mapped[str] = mapped_column(String(200), default="")
    sf_contact_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    category: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(100), unique=True)

    project: Mapped["Project | None"] = relationship(back_populates="tag", uselist=False)

    @property
    def project_id(self) -> str | None:
        return self.project.id if self.project else None


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tag_id: Mapped[str] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), unique=True)
    sf_opportunity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    account_name: Mapped[str] = mapped_column(String(200), default="")
    amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stage: Mapped[str] = mapped_column(String(50), default="")
    close_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("persons.id"), nullable=True)
    last_sync: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    related_tag_ids: Mapped[list] = mapped_column(JSON, default=list)
    # [{"personId": "...", "role": "..."}] 登録済みの役割のみ。役職からの推測はしない。
    roles: Mapped[list] = mapped_column(JSON, default=list)

    tag: Mapped[Tag] = relationship(back_populates="project")


class PersonTag(Base):
    __tablename__ = "person_tags"
    __table_args__ = (UniqueConstraint("person_id", "tag_id", name="uq_person_tag"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"))
    tag_id: Mapped[str] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"))
    reason: Mapped[str] = mapped_column(String(500), default="")
    # この人物にとっての関わり方（challenge / goal / expertise など）。同じ「省エネ」でも人により異なる。
    detail_role: Mapped[str] = mapped_column(String(20))
    detail_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_ids: Mapped[list] = mapped_column(JSON, default=list)


class PersonRelation(Base):
    __tablename__ = "person_relations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    from_id: Mapped[str] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"))
    to_id: Mapped[str] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(200))
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)


class PersonOverview(Base):
    """AI が作った人物の概要。元データ（プロフィール・タグ・メモ等）のハッシュが変わったら作り直す。"""

    __tablename__ = "person_overviews"

    person_id: Mapped[str] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), primary_key=True)
    bullets: Mapped[list] = mapped_column(JSON, default=list)
    source_ids: Mapped[list] = mapped_column(JSON, default=list)
    data_hash: Mapped[str] = mapped_column(String(64))
    mode: Mapped[str] = mapped_column(String(20))
    generated_at: Mapped[datetime] = mapped_column(DateTime)


class Memo(Base):
    __tablename__ = "memos"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    context: Mapped[str] = mapped_column(String(200), default="")
    registrar: Mapped[str] = mapped_column(String(100), default="")
    quote: Mapped[str] = mapped_column(Text, default="")
    interpretation: Mapped[str] = mapped_column(Text, default="")
    confirmed_by_registrar: Mapped[bool] = mapped_column(Boolean, default=False)
    scope: Mapped[str] = mapped_column(String(50), default="社内共有")
    tag_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

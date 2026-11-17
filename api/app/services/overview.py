"""人物の AI 概要の作成と保存。

元データ（プロフィール・タグ・メモ・関係・商談・同じタグの人）と AI の接続先からハッシュを作り、
保存済みの概要と同じなら AI を呼ばずにそのまま返す（デモ中の待ち時間と、AI の利用上限への対策）。
"""

import hashlib
import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.services import ai
from app.services.knowledge import NotFoundError


def _yen(amount: int | None) -> str:
    if amount is None:
        return "金額未登録"
    return f"{amount // 10_000:,}万円" if amount >= 10_000 else f"{amount:,}円"


def build_context(db: Session, person: models.Person) -> dict:
    pts = db.scalars(select(models.PersonTag).where(models.PersonTag.person_id == person.id)).all()
    tags = {t.id: t for t in db.scalars(select(models.Tag).where(models.Tag.id.in_([pt.tag_id for pt in pts])))}
    people = {p.id: p for p in db.scalars(select(models.Person))}

    tag_items = []
    same_tag = []
    for pt in sorted(pts, key=lambda x: x.id):
        tag = tags.get(pt.tag_id)
        if not tag:
            continue
        tag_items.append({
            "label": tag.label, "category": tag.category, "detailRole": pt.detail_role,
            "detailLabel": pt.detail_label, "reason": pt.reason,
        })
        others = db.scalars(
            select(models.PersonTag).where(models.PersonTag.tag_id == tag.id, models.PersonTag.person_id != person.id)
        ).all()
        for o in sorted(others, key=lambda x: x.person_id)[:6]:
            op = people.get(o.person_id)
            if op:
                same_tag.append({
                    "tag": tag.label, "name": op.name, "company": op.company, "deptTitle": op.dept_title,
                    "detailRole": o.detail_role, "reason": o.reason,
                })

    memos = db.scalars(
        select(models.Memo).where(models.Memo.person_id == person.id).order_by(models.Memo.date.desc(), models.Memo.id)
    ).all()[:10]
    relations = db.scalars(
        select(models.PersonRelation).where(
            (models.PersonRelation.from_id == person.id) | (models.PersonRelation.to_id == person.id)
        ).order_by(models.PersonRelation.id)
    ).all()
    projects = db.scalars(
        select(models.Project).where(models.Project.tag_id.in_([pt.tag_id for pt in pts])).order_by(models.Project.id)
    ).all()

    return {
        "profile": {"name": person.name, "company": person.company, "deptTitle": person.dept_title, "summary": person.summary},
        "tags": tag_items,
        "memos": [
            {"id": m.id, "date": m.date.isoformat(), "context": m.context, "registrar": m.registrar,
             "quote": m.quote[:300], "interpretation": m.interpretation[:300]}
            for m in memos
        ],
        "relations": [
            {"name": people[r.to_id if r.from_id == person.id else r.from_id].name, "label": r.label, "confirmed": r.confirmed}
            for r in relations
            if (r.to_id if r.from_id == person.id else r.from_id) in people
        ],
        "projects": [
            {
                "name": pr.name, "account": pr.account_name, "amount": _yen(pr.amount), "stage": pr.stage,
                "closeDate": pr.close_date.isoformat() if pr.close_date else None,
                "owner": people[pr.owner_id].name if pr.owner_id in people else None,
                "role": next((r["role"] for r in (pr.roles or []) if r.get("personId") == person.id), "役割未登録"),
            }
            for pr in projects
        ],
        "sameTagPeople": same_tag,
    }


def _hash(context: dict) -> str:
    s = get_settings()
    target = s.AZURE_OPENAI_DEPLOYMENT if s.ai_mode == "azure" else s.OPENAI_MODEL if s.ai_mode == "openai" else "mock"
    raw = json.dumps({"ctx": context, "mode": s.ai_mode, "target": target, "v": 1}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_overview(db: Session, person_id: str, force: bool = False) -> tuple[models.PersonOverview, bool]:
    """(概要, 保存済みを返したか)"""
    person = db.get(models.Person, person_id)
    if not person:
        raise NotFoundError("人物が見つかりません")
    context = build_context(db, person)
    h = _hash(context)
    row = db.get(models.PersonOverview, person_id)
    if row and row.data_hash == h and not force:
        return row, True

    bullets, sources = ai.overview(context)
    memo_ids = {m["id"] for m in context["memos"]}
    sources = [s for s in dict.fromkeys(sources) if s in memo_ids]
    if not bullets:
        bullets, sources = ai._mock_overview(context)

    if row is None:
        row = models.PersonOverview(person_id=person_id)
        db.add(row)
    row.bullets = bullets
    row.source_ids = sources
    row.data_hash = h
    row.mode = get_settings().ai_mode
    row.generated_at = datetime.now()
    db.commit()
    return row, False

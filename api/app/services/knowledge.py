"""共通知の登録・タグ調整・メモ登録のユースケース。トランザクションはここで commit する。"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.schemas import (
    AssignedTag,
    KnowledgeIn,
    MemoCreate,
    PersonTagCreate,
    PersonTagUpdate,
    RegisteredTag,
    Summary,
)
from app.services import ai


class NotFoundError(Exception):
    pass


class ValidationError(Exception):
    pass


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def load_graph(db: Session) -> dict:
    return {
        "persons": db.scalars(select(models.Person).order_by(models.Person.created_at, models.Person.id)).all(),
        "tags": db.scalars(select(models.Tag).options(selectinload(models.Tag.project))).all(),
        "projects": db.scalars(select(models.Project)).all(),
        "person_tags": db.scalars(select(models.PersonTag)).all(),
        "person_relations": db.scalars(select(models.PersonRelation)).all(),
        "memos": db.scalars(select(models.Memo).order_by(models.Memo.date.desc())).all(),
    }


def existing_tags(db: Session) -> list[dict[str, str]]:
    return [{"id": t.id, "label": t.label, "category": t.category} for t in db.scalars(select(models.Tag))]


# ---------- 共通知の登録（要約確認画面の「共通知に登録」） ----------


def register_knowledge(db: Session, body: KnowledgeIn) -> dict:
    s = body.summary
    if not s.person_name.strip():
        raise ValidationError("対象人物名を入力してください")

    person, is_new = _find_or_create_person(db, s)

    memo = models.Memo(
        id=new_id("m"),
        person_id=person.id,
        date=date.today(),
        context="音声メモ",
        registrar=body.registrar,
        quote=s.quote,
        interpretation=s.interpretation,
        confirmed_by_registrar=True,  # 要約確認画面で登録者が確認済み
        scope="社内共有",
        tag_ids=[],
    )
    db.add(memo)
    db.flush()

    suggestions = ai.auto_tag(s, existing_tags(db))
    registered = [_attach_tag(db, person.id, t, memo.id) for t in suggestions]
    memo.tag_ids = [r.tag_id for r in registered]
    db.commit()
    return {"person": person, "memo": memo, "assigned_tags": registered, "is_new_person": is_new}


def _find_or_create_person(db: Session, s: Summary) -> tuple[models.Person, bool]:
    name = s.person_name.strip()
    candidates = db.scalars(select(models.Person).where(models.Person.name.in_([name, name.replace(" ", ""), name.replace("　", " ")]))).all()
    if not candidates:
        # 姓だけで話した場合（「田中部長」など）にも一致させる
        candidates = [p for p in db.scalars(select(models.Person)) if p.name.split(" ")[0] == name]
    if s.company:
        same_company = [p for p in candidates if p.company == s.company]
        candidates = same_company or ([] if len(candidates) > 1 else candidates)
    if len(candidates) == 1:
        p = candidates[0]
        if not p.company and s.company:
            p.company = s.company
        return p, False

    dept_title = " ".join(x for x in [s.dept, s.position] if x)
    p = models.Person(
        id=new_id("p"),
        name=name,
        short_name=name[:1],
        company=s.company,
        dept_title=dept_title,
        sf_contact_id=None,
        summary=s.interpretation[:200],
    )
    db.add(p)
    db.flush()
    return p, True


def _get_or_create_tag(db: Session, tag_id: str | None, label: str | None, category: str) -> tuple[models.Tag, bool]:
    if tag_id:
        tag = db.get(models.Tag, tag_id)
        if tag:
            return tag, False
    label = (label or "").strip()
    if not label:
        raise ValidationError("タグ名を入力してください")
    tag = db.scalar(select(models.Tag).where(models.Tag.label == label))
    if tag:
        return tag, False
    tag = models.Tag(id=new_id("t"), category=category, label=label)
    db.add(tag)
    db.flush()
    return tag, True


def _attach_tag(db: Session, person_id: str, t: AssignedTag, memo_id: str | None) -> RegisteredTag:
    tag, created = _get_or_create_tag(db, t.tag_id, t.label, t.category)
    pt = db.scalar(
        select(models.PersonTag).where(models.PersonTag.person_id == person_id, models.PersonTag.tag_id == tag.id)
    )
    if pt is None:
        pt = models.PersonTag(
            id=new_id("pt"),
            person_id=person_id,
            tag_id=tag.id,
            reason=t.reason,
            detail_role=t.detail_role,
            detail_label=None,
            source_ids=[memo_id] if memo_id else [],
        )
        db.add(pt)
    else:
        if memo_id and memo_id not in (pt.source_ids or []):
            pt.source_ids = [*(pt.source_ids or []), memo_id]
        if t.reason:
            pt.reason = t.reason
    db.flush()
    return RegisteredTag(
        person_tag_id=pt.id,
        tag_id=tag.id,
        label=tag.label,
        category=tag.category,
        reason=pt.reason,
        detail_role=pt.detail_role,
        is_new_tag=created,
    )


# ---------- タグの追加・変更・削除（タグ付け結果画面・詳細パネル） ----------


def add_person_tag(db: Session, body: PersonTagCreate) -> RegisteredTag:
    if not db.get(models.Person, body.person_id):
        raise NotFoundError("人物が見つかりません")
    t = AssignedTag(
        tag_id=body.tag_id,
        label=body.label or "",
        category=body.category,
        reason=body.reason,
        detail_role=body.category,
        is_new_tag=False,
    )
    r = _attach_tag(db, body.person_id, t, None)
    db.commit()
    return r


def update_person_tag(db: Session, pt_id: str, body: PersonTagUpdate) -> models.PersonTag:
    pt = db.get(models.PersonTag, pt_id)
    if not pt:
        raise NotFoundError("タグの紐づけが見つかりません")
    if body.reason is not None:
        pt.reason = body.reason
    if body.detail_role is not None:
        pt.detail_role = body.detail_role
        # この人物だけが使っているタグなら、タグ自体のカテゴリーも合わせる（共通タグは変えない）
        users = db.scalars(select(models.PersonTag).where(models.PersonTag.tag_id == pt.tag_id)).all()
        tag = db.get(models.Tag, pt.tag_id)
        if tag and len(users) == 1 and tag.category != "project" and body.detail_role != "project":
            tag.category = body.detail_role
    db.commit()
    return pt


def delete_person_tag(db: Session, pt_id: str) -> None:
    pt = db.get(models.PersonTag, pt_id)
    if not pt:
        raise NotFoundError("タグの紐づけが見つかりません")
    tag_id = pt.tag_id
    db.delete(pt)
    db.flush()
    # 誰にも使われなくなった新規タグ（案件以外）は削除する
    tag = db.get(models.Tag, tag_id)
    still_used = db.scalar(select(models.PersonTag.id).where(models.PersonTag.tag_id == tag_id).limit(1))
    if tag and not still_used and tag.category != "project" and tag.project is None:
        db.delete(tag)
    db.commit()


# ---------- テキストメモ登録・確認 ----------


def create_memo(db: Session, body: MemoCreate) -> dict:
    person = db.get(models.Person, body.person_id)
    if not person:
        raise NotFoundError("人物が見つかりません")
    if not body.quote.strip() and not body.interpretation.strip():
        raise ValidationError("発言内容か解釈のどちらかを入力してください")

    memo = models.Memo(
        id=new_id("m"),
        person_id=person.id,
        date=date.today(),
        context=body.context,
        registrar=body.registrar,
        quote=body.quote,
        interpretation=body.interpretation,
        confirmed_by_registrar=False,
        scope="社内共有",
        tag_ids=[],
    )
    db.add(memo)
    db.flush()

    if body.tag_ids:
        suggestions = []
        for tid in body.tag_ids:
            tag = db.get(models.Tag, tid)
            if not tag:
                raise NotFoundError(f"タグ {tid} が見つかりません")
            suggestions.append(
                AssignedTag(tag_id=tag.id, label=tag.label, category=tag.category, reason=body.interpretation[:60], detail_role=tag.category, is_new_tag=False)
            )
    elif body.auto_tag:
        s = Summary(company=person.company, person_name=person.name, quote=body.quote, interpretation=body.interpretation)
        suggestions = ai.auto_tag(s, existing_tags(db))
    else:
        suggestions = []

    registered = [_attach_tag(db, person.id, t, memo.id) for t in suggestions]
    memo.tag_ids = [r.tag_id for r in registered]
    db.commit()
    return {"memo": memo, "assigned_tags": registered}


def confirm_memo(db: Session, memo_id: str) -> models.Memo:
    memo = db.get(models.Memo, memo_id)
    if not memo:
        raise NotFoundError("メモが見つかりません")
    memo.confirmed_by_registrar = True
    db.commit()
    return memo

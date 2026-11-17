"""HTTP エンドポイント。業務ロジックは services 側に置き、ここでは入出力の変換だけを行う。"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas import (
    AutoTagIn,
    AutoTagOut,
    CamelModel,
    GraphOut,
    KnowledgeIn,
    KnowledgeOut,
    MemoCreate,
    MemoOut,
    OverviewOut,
    PersonOut,
    PersonTagCreate,
    PersonTagOut,
    PersonTagUpdate,
    PersonUpdate,
    RegisteredTag,
    SummarizeIn,
    SummarizeOut,
    Summary,
)
from app.services import ai, knowledge, overview

router = APIRouter(prefix="/api")


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "db": db.bind.dialect.name, "ai": get_settings().ai_mode}


@router.get("/graph", response_model=GraphOut, response_model_by_alias=True)
def graph(db: Session = Depends(get_db)):
    return knowledge.load_graph(db)


# ---------- OpenAI API（要約・タグ付け） ----------


@router.post("/summarize", response_model=SummarizeOut)
def summarize(body: SummarizeIn):
    return SummarizeOut(summary=ai.summarize(body.transcript), mode=get_settings().ai_mode)


@router.post("/auto-tag", response_model=AutoTagOut)
def auto_tag(body: AutoTagIn, db: Session = Depends(get_db)):
    summary = Summary.model_validate(body.model_dump(exclude={"transcript"}))
    tags = ai.auto_tag(summary, knowledge.existing_tags(db), transcript=body.transcript)
    return AutoTagOut(assigned_tags=tags, mode=get_settings().ai_mode)


# ---------- 登録・更新 ----------


@router.post("/knowledge", response_model=KnowledgeOut, status_code=201)
def register_knowledge(body: KnowledgeIn, db: Session = Depends(get_db)):
    result = knowledge.register_knowledge(db, body)
    return KnowledgeOut.model_validate({**result, "mode": get_settings().ai_mode})


@router.post("/persons/{person_id}/overview", response_model=OverviewOut)
def person_overview(person_id: str, force: bool = False, db: Session = Depends(get_db)):
    """人物の AI 概要。元データが変わっていなければ保存済みを返す（force=true で作り直す）。"""
    row, cached = overview.get_overview(db, person_id, force=force)
    return OverviewOut(
        person_id=row.person_id, bullets=row.bullets, source_memo_ids=row.source_ids,
        mode=row.mode, cached=cached, generated_at=row.generated_at,
    )


@router.patch("/persons/{person_id}", response_model=PersonOut)
def update_person(person_id: str, body: PersonUpdate, db: Session = Depends(get_db)):
    return knowledge.update_person(db, person_id, body)


@router.post("/person-tags", response_model=RegisteredTag, status_code=201)
def add_person_tag(body: PersonTagCreate, db: Session = Depends(get_db)):
    return knowledge.add_person_tag(db, body)


@router.patch("/person-tags/{pt_id}", response_model=PersonTagOut)
def update_person_tag(pt_id: str, body: PersonTagUpdate, db: Session = Depends(get_db)):
    return knowledge.update_person_tag(db, pt_id, body)


@router.delete("/person-tags/{pt_id}", status_code=204)
def delete_person_tag(pt_id: str, db: Session = Depends(get_db)):
    knowledge.delete_person_tag(db, pt_id)
    return Response(status_code=204)


class MemoCreateOut(CamelModel):
    memo: MemoOut
    assigned_tags: list[RegisteredTag]


@router.post("/memos", response_model=MemoCreateOut, status_code=201)
def create_memo(body: MemoCreate, db: Session = Depends(get_db)):
    return knowledge.create_memo(db, body)


@router.patch("/memos/{memo_id}/confirm", response_model=MemoOut)
def confirm_memo(memo_id: str, db: Session = Depends(get_db)):
    return knowledge.confirm_memo(db, memo_id)

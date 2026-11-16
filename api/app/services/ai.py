"""OpenAI API による要約抽出（ステップ1）と自動タグ付け（ステップ2）。

OPENAI_API_KEY が未設定のときは、キーワード一致による簡易版（モック）で同じ形の結果を返す。
API キーはサーバー側だけで扱い、ブラウザには出さない。
"""

import json
import re
from typing import Any

import httpx

from app.categories import CATEGORIES, CATEGORY_IDS
from app.config import get_settings
from app.schemas import AssignedTag, Summary

# openai SDK はネイティブ拡張（jiter）に依存し、Windows のスマート アプリ コントロール環境で
# 読み込めないことがあるため、Chat Completions API を httpx で直接呼ぶ。
_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_client = httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0))


class AIError(Exception):
    pass


def _structured(system: str, user: str, schema_name: str, schema: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    payload = {
        "model": settings.OPENAI_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        },
        "temperature": 0.2,
    }
    try:
        resp = _client.post(_OPENAI_URL, json=payload, headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"})
    except httpx.HTTPError as e:
        raise AIError("OpenAI API に接続できませんでした") from e
    if resp.status_code != 200:
        raise AIError(f"OpenAI API がエラーを返しました（HTTP {resp.status_code}）")
    message = resp.json()["choices"][0]["message"]
    if message.get("refusal"):
        raise AIError("OpenAI API が要約を返しませんでした。内容を見直して再度お試しください")
    return json.loads(message.get("content") or "{}")


# ---------------- ステップ1：要約抽出 ----------------

_SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["company", "personName", "dept", "position", "quote", "interpretation"],
    "properties": {
        "company": {"type": "string", "description": "会社名。不明なら空文字"},
        "personName": {"type": "string", "description": "対象人物の氏名。不明なら空文字"},
        "dept": {"type": "string", "description": "部署。不明なら空文字"},
        "position": {"type": "string", "description": "ポジション・役職。不明なら空文字"},
        "quote": {"type": "string", "description": "本人の発言要旨・原文抜粋"},
        "interpretation": {"type": "string", "description": "関わる理由・商談上の解釈（登録者の解釈）"},
    },
}

_SUMMARY_SYSTEM = (
    "あなたは営業担当者の訪問メモを整理するアシスタントです。"
    "音声の文字起こしから、会った相手の情報を抽出してください。"
    "書かれていないことは推測せず空文字にしてください。"
    "quote には相手本人の発言の要旨を、interpretation には登録者が感じた関わる理由や商談上の示唆を簡潔にまとめてください。"
)


def summarize(transcript: str) -> Summary:
    if get_settings().ai_mode == "openai":
        data = _structured(_SUMMARY_SYSTEM, transcript, "summary", _SUMMARY_SCHEMA)
        return Summary.model_validate(data)
    return _mock_summarize(transcript)


def _mock_summarize(text: str) -> Summary:
    company = _first(r"([^\s、。「」]{1,20}株式会社|株式会社[^\s、。「」]{1,20})", text)
    m = re.search(r"([一-龥々]{1,4}(?:\s?[一-龥々]{1,4})?)\s?(部長|課長|係長|工場長|室長|リーダー|マネージャー|社長|さん|様)", text)
    person = m.group(1) if m else ""
    title = m.group(2) if m and m.group(2) not in ("さん", "様") else ""
    dept = _first(r"([一-龥ァ-ヶー]{1,12}(?:部|課|室|グループ))", text)
    if title and dept.endswith(title):
        dept = dept[: -len(title)]
    # 「渡辺部長」の「渡辺部」のように、氏名＋役職を部署と誤認したものは捨てる
    if person and dept.startswith(person):
        dept = ""
    quote = text.strip()[:300]
    return Summary(
        company=company,
        person_name=person,
        dept=dept,
        position=title,
        quote=quote,
        interpretation="（簡易抽出）OpenAI API キーが未設定のため、文字起こしをそのまま要約欄に入れています。内容を確認して修正してください。",
    )


def _first(pattern: str, text: str) -> str:
    m = re.search(pattern, text)
    return m.group(1) if m else ""


# ---------------- ステップ2：自動タグ付け ----------------

_TAG_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["assignedTags"],
    "properties": {
        "assignedTags": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["tagId", "label", "category", "reason", "detailRole", "isNewTag"],
                "properties": {
                    "tagId": {"type": ["string", "null"], "description": "既存タグへ名寄せする場合はその ID。新規なら null"},
                    "label": {"type": "string"},
                    "category": {"type": "string", "enum": CATEGORY_IDS},
                    "reason": {"type": "string", "description": "この人物がこのタグに関わる理由（20字程度）"},
                    "detailRole": {
                        "type": "string",
                        "enum": CATEGORY_IDS,
                        "description": "この人物にとっての関わり方。同じテーマでも 課題(challenge)/目的(goal)/経験(expertise) を区別する",
                    },
                    "isNewTag": {"type": "boolean"},
                },
            },
        }
    },
}


def _tag_system() -> str:
    cats = "\n".join(f"- {k}: {v}" for k, v in CATEGORIES.items())
    return (
        "あなたは営業ナレッジのタグ付け担当です。人物の要約から 1〜5 個のタグを付けてください。\n"
        "既存タグと同じ意味のものは必ず既存タグの tagId と label を使って名寄せし、isNewTag=false にしてください。\n"
        "既存に無いものだけ新規タグ（tagId=null, isNewTag=true）にしてください。\n"
        "共通の趣味があるだけで面識や協力関係があるとは書かないでください。\n"
        f"カテゴリー:\n{cats}"
    )


# モック用：既存タグに無い言い回しでも拾うためのキーワード
_KEYWORDS: dict[str, list[str]] = {
    "t-energy": ["省エネ", "電力", "エネルギー"],
    "t-budget": ["電気代", "光熱費"],
    "t-aging": ["老朽", "更新", "故障"],
    "t-cost": ["コスト", "相見積", "値下げ"],
    "t-training": ["若手", "育成", "教育"],
    "t-carbon": ["脱炭素", "CO2", "カーボン"],
    "t-subsidy": ["補助金", "助成金", "税制"],
    "t-fishing": ["釣り"],
    "t-golf": ["ゴルフ"],
    "t-sauna": ["サウナ"],
    "t-camp": ["キャンプ"],
    "t-marathon": ["マラソン", "ランニング"],
}


def auto_tag(summary: Summary, existing: list[dict[str, str]]) -> list[AssignedTag]:
    """existing: [{"id","label","category"}]"""
    if get_settings().ai_mode == "openai":
        user = json.dumps(
            {"summary": summary.model_dump(by_alias=True), "existingTags": existing}, ensure_ascii=False
        )
        data = _structured(_tag_system(), user, "auto_tag", _TAG_SCHEMA)
        tags = [AssignedTag.model_validate(t) for t in data.get("assignedTags", [])]
        return _normalize(tags, existing)
    return _mock_auto_tag(summary, existing)


def _normalize(tags: list[AssignedTag], existing: list[dict[str, str]]) -> list[AssignedTag]:
    """存在しない tagId を新規扱いにし、ラベル一致の既存タグへ名寄せする。重複は除く。"""
    by_id = {t["id"]: t for t in existing}
    by_label = {t["label"]: t for t in existing}
    seen: set[str] = set()
    out: list[AssignedTag] = []
    for t in tags:
        hit = by_id.get(t.tag_id or "") or by_label.get(t.label)
        if hit:
            t = t.model_copy(update={"tag_id": hit["id"], "label": hit["label"], "category": hit["category"], "is_new_tag": False})
        else:
            t = t.model_copy(update={"tag_id": None, "is_new_tag": True})
        key = t.tag_id or t.label
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def _mock_auto_tag(summary: Summary, existing: list[dict[str, str]]) -> list[AssignedTag]:
    text = " ".join([summary.company, summary.quote, summary.interpretation])
    out: list[AssignedTag] = []
    for t in existing:
        words = [t["label"], *_KEYWORDS.get(t["id"], [])]
        hit = next((w for w in words if w and w in text), None)
        if hit:
            out.append(
                AssignedTag(
                    tag_id=t["id"],
                    label=t["label"],
                    category=t["category"],
                    reason=f"発言に「{hit}」が含まれる",
                    detail_role=t["category"],
                    is_new_tag=False,
                )
            )
    return _normalize(out, existing)[:5]

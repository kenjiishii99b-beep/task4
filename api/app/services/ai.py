"""AI（Azure OpenAI または OpenAI）による要約抽出（ステップ1）と自動タグ付け（ステップ2）。

接続先は設定で決まる（config.Settings.ai_mode）:
  azure  … AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT がそろっている
  openai … OPENAI_API_KEY がある
  mock   … どちらもない（キーワード一致による簡易版で同じ形の結果を返す）
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


def _target() -> tuple[str, dict[str, str], str, str]:
    """(URL, ヘッダー, payload の model 値, 表示名)"""
    s = get_settings()
    if s.ai_mode == "azure":
        base = s.AZURE_OPENAI_ENDPOINT.rstrip("/")
        headers = {"api-key": s.AZURE_OPENAI_API_KEY}
        if s.AZURE_OPENAI_API_VERSION:
            url = f"{base}/openai/deployments/{s.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version={s.AZURE_OPENAI_API_VERSION}"
        else:
            url = f"{base}/openai/v1/chat/completions"
        return url, headers, s.AZURE_OPENAI_DEPLOYMENT, "Azure OpenAI"
    return _OPENAI_URL, {"Authorization": f"Bearer {s.OPENAI_API_KEY}"}, s.OPENAI_MODEL, "OpenAI API"


def _rejects_temperature(resp: httpx.Response) -> bool:
    """推論系モデル（gpt-5 系など）は temperature の指定を受け付けず 400 を返す"""
    return resp.status_code == 400 and "temperature" in resp.text


def _structured(system: str, user: str, schema_name: str, schema: dict[str, Any]) -> dict[str, Any]:
    url, headers, model, label = _target()
    payload: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        },
        "temperature": 0.2,
    }
    try:
        resp = _client.post(url, json=payload, headers=headers)
        if _rejects_temperature(resp):
            payload.pop("temperature")
            resp = _client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise AIError(f"{label} に接続できませんでした") from e
    if resp.status_code == 429:
        raise AIError(f"{label} の利用上限に達しました。少し時間をおいて再度お試しください")
    if resp.status_code != 200:
        raise AIError(f"{label} がエラーを返しました（HTTP {resp.status_code}）")
    message = resp.json()["choices"][0]["message"]
    if message.get("refusal"):
        raise AIError(f"{label} が結果を返しませんでした。内容を見直して再度お試しください")
    return json.loads(message.get("content") or "{}")


# ---------------- ステップ1：要約抽出 ----------------

_SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["company", "personName", "dept", "position", "quote", "interpretation"],
    "properties": {
        "company": {"type": "string", "description": "会社名。不明なら空文字"},
        "personName": {"type": "string", "description": "対象人物の氏名のみ（役職・敬称は含めない。例: 田中部長 → 田中）。不明なら空文字"},
        "dept": {"type": "string", "description": "部署。不明なら空文字"},
        "position": {"type": "string", "description": "ポジション・役職。不明なら空文字"},
        "quote": {
            "type": "string",
            "description": "本人の発言要旨・原文抜粋。商談の話に加え、趣味・関心・人柄・見た目の特徴など人物理解に役立つ話も省かずに含める",
        },
        "interpretation": {"type": "string", "description": "関わる理由・商談上の解釈（登録者の解釈）"},
    },
}

_SUMMARY_SYSTEM = (
    "あなたは営業担当者の訪問メモを整理するアシスタントです。"
    "音声の文字起こしから、会った相手の情報を抽出してください。"
    "書かれていないことは推測せず空文字にしてください。"
    "personName には氏名だけを入れ、「部長」「さん」などの役職・敬称は含めないでください（役職は position に入れる）。"
    "quote には相手本人の発言の要旨をまとめてください。"
    "商談・課題の話だけでなく、趣味・関心ごと・人柄・見た目の特徴など、人物を理解する手がかりになる話も必ず残してください"
    "（このメモは「人物マップ」で共通の話題を見つけるために使われます）。"
    "「〜だそうです」「〜とのこと」のような登録者の伝聞の形でも、相手本人についての情報なら quote に含めてください。"
    "できるだけ本人の言い回しを残し、話題ごとに文を分けてください。"
    "interpretation には登録者が感じた関わる理由や商談上の示唆を簡潔にまとめてください。"
)


_TITLES = ("部長", "課長", "係長", "工場長", "室長", "社長", "専務", "常務", "所長", "主任", "リーダー", "マネージャー")
_HONORIFICS = ("さん", "様", "氏", "殿")


def split_name_title(name: str) -> tuple[str, str]:
    """「田中部長」→（田中, 部長）、「佐藤さん」→（佐藤, ""）。役職・敬称を氏名から切り離す。"""
    n = name.strip()
    for h in _HONORIFICS:
        if n.endswith(h) and len(n) > len(h):
            n = n[: -len(h)].strip()
    for t in sorted(_TITLES, key=len, reverse=True):
        if n.endswith(t) and len(n) > len(t):
            return n[: -len(t)].strip(), t
    return n, ""


def _clean(s: Summary) -> Summary:
    name, title = split_name_title(s.person_name)
    return s.model_copy(update={"person_name": name, "position": s.position or title})


def summarize(transcript: str) -> Summary:
    if get_settings().ai_mode != "mock":
        data = _structured(_SUMMARY_SYSTEM, transcript, "summary", _SUMMARY_SCHEMA)
        return _clean(Summary.model_validate(data))
    return _clean(_mock_summarize(transcript))


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
        "あなたは営業ナレッジのタグ付け担当です。人物の要約（summary）と元の文字起こし（transcript）から 1〜6 個のタグを付けてください。\n"
        "要約から漏れていても、文字起こしに出てくる趣味・関心ごとなど人物理解に役立つ話題はタグにしてください。\n"
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


def auto_tag(summary: Summary, existing: list[dict[str, str]], transcript: str = "") -> list[AssignedTag]:
    """existing: [{"id","label","category"}]。transcript は要約から漏れた話題（趣味など）を拾うために渡す。"""
    if get_settings().ai_mode != "mock":
        user = json.dumps(
            {"summary": summary.model_dump(by_alias=True), "transcript": transcript[:6000], "existingTags": existing},
            ensure_ascii=False,
        )
        data = _structured(_tag_system(), user, "auto_tag", _TAG_SCHEMA)
        tags = [AssignedTag.model_validate(t) for t in data.get("assignedTags", [])]
        return _normalize(tags, existing)
    return _mock_auto_tag(summary, existing, transcript)


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


def _mock_auto_tag(summary: Summary, existing: list[dict[str, str]], transcript: str = "") -> list[AssignedTag]:
    text = " ".join([summary.company, summary.quote, summary.interpretation, transcript])
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
    return _normalize(out, existing)[:6]


# ---------------- 人物の AI 概要 ----------------

_OVERVIEW_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["bullets", "sourceMemoIds"],
    "properties": {
        "bullets": {"type": "array", "items": {"type": "string"}, "description": "3〜4 個の短い箇条書き（各 60 字以内）"},
        "sourceMemoIds": {"type": "array", "items": {"type": "string"}, "description": "根拠にしたメモの id"},
    },
}

_OVERVIEW_SYSTEM = (
    "あなたは営業チームのナレッジ担当です。後任の営業が、この人物に初めて会う前に読む概要を作ります。"
    "与えられた JSON（profile・tags・memos・relations・projects・sameTagPeople）だけを根拠に、"
    "日本語の短い箇条書きを 3〜4 個作ってください（各 60 字以内、です・ます調は使わず体言止めや常体で）。\n"
    "1 つ目：どんな立場の人か（会社・役職・意思決定への関わり）。\n"
    "2 つ目：関心ごと・困りごと・目的と、その理由。\n"
    "3 つ目：進行中の商談の状況と、同じテーマに詳しい社内（company が「自社」）の人がいればその名前。\n"
    "4 つ目（材料があれば）：会話のきっかけになる趣味など。\n"
    "書かれていないことは推測しない。共通の趣味・関心があるだけの相手について、知り合い・面識があるとは書かない"
    "（触れる場合は「面識は未確認」と添える）。sourceMemoIds には根拠にしたメモの id を入れる。"
)


def overview(context: dict[str, Any]) -> tuple[list[str], list[str]]:
    """人物の文脈から概要の箇条書きと根拠メモ id を返す。"""
    if get_settings().ai_mode != "mock":
        data = _structured(_OVERVIEW_SYSTEM, json.dumps(context, ensure_ascii=False), "person_overview", _OVERVIEW_SCHEMA)
        bullets = [b.strip() for b in data.get("bullets", []) if isinstance(b, str) and b.strip()][:4]
        return bullets, [s for s in data.get("sourceMemoIds", []) if isinstance(s, str)]
    return _mock_overview(context)


def _mock_overview(ctx: dict[str, Any]) -> tuple[list[str], list[str]]:
    p = ctx["profile"]
    bullets = [f"{p['company']}・{p['deptTitle']}。{p['summary']}".strip("。") + "。"]
    concerns = [t for t in ctx["tags"] if t["category"] not in ("hobby", "project")]
    if concerns:
        bullets.append("関心・課題：" + "、".join(f"{t['label']}（{t['reason']}）" for t in concerns[:3]))
    if ctx["projects"]:
        pr = ctx["projects"][0]
        bullets.append(f"商談：{pr['name']}（{pr['amount']}・{pr['stage']}）")
    hobbies = [t for t in ctx["tags"] if t["category"] == "hobby"]
    if hobbies:
        bullets.append("会話のきっかけ：" + "、".join(f"{t['label']}（{t['reason']}）" for t in hobbies[:2]))
    return bullets[:4], [m["id"] for m in ctx["memos"][:2]]

"""人物の AI 概要（保存・作り直し・AI 経路）のテスト。"""

import json

from app.config import get_settings
from app.services import ai


def test_overview_mock_is_generated_then_cached(client):
    r1 = client.post("/api/persons/p-tanaka/overview")
    assert r1.status_code == 200
    o1 = r1.json()
    assert o1["mode"] == "mock" and o1["cached"] is False
    assert 2 <= len(o1["bullets"]) <= 4
    assert any("ポンプ入替工事" in b and "1,200万円" in b for b in o1["bullets"])
    assert set(o1["sourceMemoIds"]) <= {"m-tanaka-1", "m-tanaka-2"}

    o2 = client.post("/api/persons/p-tanaka/overview").json()
    assert o2["cached"] is True and o2["bullets"] == o1["bullets"]


def test_overview_is_regenerated_after_new_memo(client):
    client.post("/api/persons/p-sato/overview")
    client.post("/api/memos", json={"personId": "p-sato", "quote": "来月から購買部長になります", "interpretation": "", "tagIds": []})
    assert client.post("/api/persons/p-sato/overview").json()["cached"] is False


def test_overview_force_regenerates(client):
    client.post("/api/persons/p-ito/overview")
    assert client.post("/api/persons/p-ito/overview?force=true").json()["cached"] is False


def test_overview_unknown_person_404(client):
    assert client.post("/api/persons/p-none/overview").status_code == 404


class _Resp:
    def __init__(self, content: dict):
        self.status_code = 200
        self.text = ""
        self._content = content

    def json(self):
        return {"choices": [{"message": {"content": json.dumps(self._content, ensure_ascii=False)}}]}


def test_overview_ai_gets_grounded_context_and_sources_are_filtered(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "OPENAI_API_KEY", "sk-test")
    sent = []

    def fake_post(url, json=None, headers=None):
        sent.append(json)
        return _Resp({"bullets": ["設備更新の最終判断者", "電気代の予算圧迫が最大の関心", "ポンプ入替工事が提案・見積"],
                      "sourceMemoIds": ["m-tanaka-1", "m-not-exist", "m-tanaka-1"]})

    monkeypatch.setattr(ai._client, "post", fake_post)
    o = client.post("/api/persons/p-tanaka/overview").json()
    assert o["mode"] == "openai"
    assert o["bullets"][0] == "設備更新の最終判断者"
    assert o["sourceMemoIds"] == ["m-tanaka-1"]  # 存在しない id と重複は除く

    ctx = __import__("json").loads(sent[0]["messages"][1]["content"])
    assert ctx["profile"]["name"] == "田中 健一"
    assert any(p["name"] == "伊藤 修" and p["company"] == "自社" for p in ctx["sameTagPeople"])
    assert ctx["projects"][0]["role"] == "登録済みの意思決定者"
    assert "面識は未確認" in sent[0]["messages"][0]["content"]


def test_seed_reset_also_clears_overviews(client):
    from app.db import SessionLocal
    from app import models
    from app.seed import seed

    client.post("/api/persons/p-tanaka/overview")
    seed(reset=True)
    with SessionLocal() as db:
        assert db.query(models.PersonOverview).count() == 0

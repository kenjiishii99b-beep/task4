"""OpenAI 経路のテスト（HTTP 通信はモックに差し替える）。"""

import json

import httpx

from app.config import get_settings
from app.services import ai


class _Resp:
    def __init__(self, status: int, content: dict):
        self.status_code = status
        self._content = content

    def json(self):
        return {"choices": [{"message": {"content": json.dumps(self._content, ensure_ascii=False)}}]}


def _use_openai(monkeypatch, responder):
    monkeypatch.setattr(get_settings(), "OPENAI_API_KEY", "sk-test")
    calls = []

    def fake_post(url, json=None, headers=None):
        calls.append({"url": url, "json": json, "headers": headers})
        return responder(json)

    monkeypatch.setattr(ai._client, "post", fake_post)
    return calls


def test_summarize_sends_strict_json_schema(client, monkeypatch):
    calls = _use_openai(monkeypatch, lambda _: _Resp(200, {
        "company": "東都設備株式会社", "personName": "田中 健一", "dept": "設備部",
        "position": "部長", "quote": "電気代が重い", "interpretation": "省エネに前向き",
    }))
    r = client.post("/api/summarize", json={"transcript": "テスト"})
    assert r.status_code == 200
    assert r.json()["mode"] == "openai"
    assert r.json()["summary"]["personName"] == "田中 健一"
    sent = calls[0]
    assert sent["headers"]["Authorization"] == "Bearer sk-test"
    assert sent["json"]["response_format"]["json_schema"]["strict"] is True


def test_auto_tag_normalizes_unknown_ids_and_duplicates(client, monkeypatch):
    _use_openai(monkeypatch, lambda _: _Resp(200, {"assignedTags": [
        {"tagId": "t-energy", "label": "省エネ", "category": "interest", "reason": "a", "detailRole": "challenge", "isNewTag": False},
        {"tagId": None, "label": "省エネ", "category": "interest", "reason": "dup", "detailRole": "interest", "isNewTag": True},
        {"tagId": "t-does-not-exist", "label": "夜間電力のコスト削減", "category": "challenge", "reason": "b", "detailRole": "challenge", "isNewTag": False},
    ]}))
    tags = client.post("/api/auto-tag", json={"personName": "田中", "quote": "x"}).json()["assignedTags"]
    assert [(t["tagId"], t["isNewTag"]) for t in tags] == [("t-energy", False), (None, True)]


def test_prompts_keep_personal_topics_and_send_transcript(client, monkeypatch):
    calls = _use_openai(monkeypatch, lambda _: _Resp(200, {"assignedTags": []}))
    client.post("/api/auto-tag", json={"personName": "田中", "quote": "省エネ", "transcript": "週末は海釣りに行く"})
    sent = calls[0]["json"]
    user = json.loads(sent["messages"][1]["content"])
    assert user["transcript"] == "週末は海釣りに行く"
    assert "文字起こし" in sent["messages"][0]["content"]
    # 要約の指示でも趣味・人柄を残すよう求めている
    assert "趣味" in ai._SUMMARY_SYSTEM and "人柄" in ai._SUMMARY_SYSTEM


def test_openai_error_returns_502(client, monkeypatch):
    _use_openai(monkeypatch, lambda _: _Resp(429, {}))
    r = client.post("/api/summarize", json={"transcript": "テスト"})
    assert r.status_code == 502


def test_openai_connection_error_returns_502(client, monkeypatch):
    def boom(_):
        raise httpx.ConnectError("down")

    _use_openai(monkeypatch, boom)
    assert client.post("/api/summarize", json={"transcript": "テスト"}).status_code == 502

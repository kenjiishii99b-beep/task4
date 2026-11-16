"""OpenAI / Azure OpenAI 経路のテスト（HTTP 通信はモックに差し替える）。"""

import json

import httpx

from app.config import get_settings
from app.services import ai


class _Resp:
    def __init__(self, status: int, content: dict, text: str = ""):
        self.status_code = status
        self._content = content
        self.text = text

    def json(self):
        return {"choices": [{"message": {"content": json.dumps(self._content, ensure_ascii=False)}}]}


def _capture(monkeypatch, responder):
    calls = []

    def fake_post(url, json=None, headers=None):
        calls.append({"url": url, "json": dict(json), "headers": headers})
        return responder(json)

    monkeypatch.setattr(ai._client, "post", fake_post)
    return calls


def _use_openai(monkeypatch, responder):
    monkeypatch.setattr(get_settings(), "OPENAI_API_KEY", "sk-test")
    return _capture(monkeypatch, responder)


def _use_azure(monkeypatch, responder, api_version=None):
    s = get_settings()
    monkeypatch.setattr(s, "OPENAI_API_KEY", "sk-should-not-be-used")
    monkeypatch.setattr(s, "AZURE_OPENAI_ENDPOINT", "https://example-oai.openai.azure.com/")
    monkeypatch.setattr(s, "AZURE_OPENAI_API_KEY", "azure-test-key")
    monkeypatch.setattr(s, "AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    monkeypatch.setattr(s, "AZURE_OPENAI_API_VERSION", api_version)
    return _capture(monkeypatch, responder)


_SUMMARY = {"company": "A社", "personName": "田中", "dept": "", "position": "", "quote": "q", "interpretation": "i"}


def test_azure_takes_precedence_and_uses_v1_endpoint(client, monkeypatch):
    calls = _use_azure(monkeypatch, lambda _: _Resp(200, _SUMMARY))
    r = client.post("/api/summarize", json={"transcript": "テスト"})
    assert r.status_code == 200
    assert r.json()["mode"] == "azure"
    sent = calls[0]
    assert sent["url"] == "https://example-oai.openai.azure.com/openai/v1/chat/completions"
    assert sent["headers"] == {"api-key": "azure-test-key"}
    assert sent["json"]["model"] == "gpt-4o"
    assert client.get("/api/health").json()["ai"] == "azure"


def test_azure_with_api_version_uses_deployment_url(client, monkeypatch):
    calls = _use_azure(monkeypatch, lambda _: _Resp(200, _SUMMARY), api_version="2024-10-21")
    client.post("/api/summarize", json={"transcript": "テスト"})
    assert calls[0]["url"] == "https://example-oai.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21"


def test_retries_without_temperature_for_reasoning_models(client, monkeypatch):
    def responder(payload):
        if "temperature" in payload:
            return _Resp(400, {}, text='{"error":{"message":"Unsupported value: \'temperature\'","code":"unsupported_value"}}')
        return _Resp(200, _SUMMARY)

    calls = _use_azure(monkeypatch, responder)
    r = client.post("/api/summarize", json={"transcript": "テスト"})
    assert r.status_code == 200
    assert len(calls) == 2
    assert "temperature" in calls[0]["json"] and "temperature" not in calls[1]["json"]


def test_rate_limit_returns_clear_message(client, monkeypatch):
    _use_azure(monkeypatch, lambda _: _Resp(429, {}))
    r = client.post("/api/summarize", json={"transcript": "テスト"})
    assert r.status_code == 502
    assert "上限" in r.json()["detail"]


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

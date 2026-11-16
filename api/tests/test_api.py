def test_unexpected_error_keeps_cors_headers(client, monkeypatch):
    """500 でも CORS ヘッダーが付き、ブラウザがエラー内容を読めること"""
    from app.services import knowledge

    def boom(_db):
        raise RuntimeError("db down")

    monkeypatch.setattr(knowledge, "load_graph", boom)
    r = client.get("/api/graph", headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 500
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "サーバーでエラー" in r.json()["detail"]


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "sqlite", "ai": "mock"}


def test_graph_returns_seed_data_in_camel_case(client):
    data = client.get("/api/graph").json()
    assert len(data["persons"]) == 20
    assert len(data["tags"]) == 24
    assert len(data["personTags"]) == 60
    tanaka = next(p for p in data["persons"] if p["id"] == "p-tanaka")
    assert tanaka["deptTitle"] == "設備部長"
    pump_tag = next(t for t in data["tags"] if t["id"] == "o-pump")
    assert pump_tag["projectId"] == "o-pump"
    # 各人物にタグ・案件が 3 件ずつ
    for p in data["persons"]:
        assert sum(pt["personId"] == p["id"] for pt in data["personTags"]) == 3
    # 未確認の接点が区別されている
    assert any(not r["confirmed"] for r in data["personRelations"])


def test_summarize_mock(client):
    r = client.post("/api/summarize", json={"transcript": "東都設備株式会社の田中部長に会いました。電気代が予算を圧迫していて省エネに関心があるそうです。"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "mock"
    assert body["summary"]["company"] == "東都設備株式会社"
    assert body["summary"]["personName"] == "田中"
    assert body["summary"]["position"] == "部長"
    assert body["summary"]["dept"] == ""  # 「田中部」を部署と誤認しない


def test_summarize_mock_extracts_department(client):
    s = client.post("/api/summarize", json={"transcript": "京浜マテリアル株式会社の生産技術部の渡辺部長と打合せ"}).json()["summary"]
    assert s["dept"] == "生産技術部"
    assert s["personName"] == "渡辺"


def test_register_knowledge_merges_into_existing_person_and_tags(client):
    summary = {
        "company": "東都設備株式会社",
        "personName": "田中",
        "dept": "設備部",
        "position": "部長",
        "quote": "夜間の電気代が予算を圧迫している。省エネの提案がほしい",
        "interpretation": "省エネ投資の優先順位が高い",
    }
    r = client.post("/api/knowledge", json={"summary": summary})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["isNewPerson"] is False
    assert body["person"]["id"] == "p-tanaka"
    tag_ids = {t["tagId"] for t in body["assignedTags"]}
    assert "t-energy" in tag_ids  # 既存の共通テーマへ名寄せ
    assert all(not t["isNewTag"] for t in body["assignedTags"])
    assert body["memo"]["confirmedByRegistrar"] is True


def test_register_knowledge_creates_new_person(client):
    summary = {"company": "新規株式会社", "personName": "大川 次郎", "quote": "サウナが好き", "interpretation": ""}
    body = client.post("/api/knowledge", json={"summary": summary}).json()
    assert body["isNewPerson"] is True
    assert [t["tagId"] for t in body["assignedTags"]] == ["t-sauna"]


def test_register_requires_person_name(client):
    r = client.post("/api/knowledge", json={"summary": {"personName": " "}})
    assert r.status_code == 400


def test_person_tag_add_change_delete(client):
    r = client.post("/api/person-tags", json={"personId": "p-tanaka", "label": "夜間電力のコスト削減", "category": "challenge", "reason": "省エネ投資の優先順位が高い"})
    assert r.status_code == 201
    created = r.json()
    assert created["isNewTag"] is True

    r = client.patch(f"/api/person-tags/{created['personTagId']}", json={"detailRole": "goal"})
    assert r.status_code == 200
    graph = client.get("/api/graph").json()
    tag = next(t for t in graph["tags"] if t["id"] == created["tagId"])
    assert tag["category"] == "goal"  # この人物だけのタグなのでタグ自体も変わる

    assert client.delete(f"/api/person-tags/{created['personTagId']}").status_code == 204
    graph = client.get("/api/graph").json()
    assert all(t["id"] != created["tagId"] for t in graph["tags"])  # 使われなくなった新規タグは削除


def test_shared_tag_category_is_not_changed_by_one_person(client):
    graph = client.get("/api/graph").json()
    pt = next(x for x in graph["personTags"] if x["personId"] == "p-tanaka" and x["tagId"] == "t-energy")
    client.patch(f"/api/person-tags/{pt['id']}", json={"detailRole": "goal"})
    graph = client.get("/api/graph").json()
    assert next(t for t in graph["tags"] if t["id"] == "t-energy")["category"] == "interest"


def test_text_memo_with_manual_tags_and_confirm(client):
    r = client.post("/api/memos", json={"personId": "p-sato", "quote": "相見積もりは必須", "interpretation": "購買基準が厳しい", "tagIds": ["t-cost"]})
    assert r.status_code == 201
    memo = r.json()["memo"]
    assert memo["confirmedByRegistrar"] is False
    assert client.patch(f"/api/memos/{memo['id']}/confirm").json()["confirmedByRegistrar"] is True


def test_memo_validation(client):
    assert client.post("/api/memos", json={"personId": "p-none", "quote": "x"}).status_code == 404
    assert client.post("/api/memos", json={"personId": "p-sato"}).status_code == 400

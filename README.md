# 共通知＆人物マップ

訪問の記録を音声で残し、OpenAI API で要約・自動タグ付けして、人物を起点にタグ・案件・人間関係をたどるアプリです。

- 仕様: [docs/spec.md](docs/spec.md)
- アーキテクチャ図: [docs/architecture.md](docs/architecture.md)
- シーケンス図: [docs/sequence.md](docs/sequence.md)
- Azure 構築手順: [docs/azure-setup.md](docs/azure-setup.md)
- 開発ルール・コマンド: [CLAUDE.md](CLAUDE.md)

```
Next.js（静的エクスポート）── Azure Static Web Apps（Free）
        │  fetch（CORS）
        ▼
FastAPI on Azure Functions（Flex Consumption）── OpenAI API
        │  SQLAlchemy + PyMySQL（SSL）
        ▼
Azure Database for MySQL フレキシブル サーバー
```

## すぐ動かす（ローカル）

```powershell
# 1) API  → http://localhost:7071/api/docs
cd api
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m app.seed
.\.venv\Scripts\python -m uvicorn app.main:app --port 7071 --reload

# 2) フロント → http://localhost:3000
cd frontend
npm install
npm run dev
```

`OPENAI_API_KEY` を設定しなくても、簡易抽出（モック）で一通りの流れを試せます。
音声入力は Google Chrome（`localhost` または HTTPS）で動作します。

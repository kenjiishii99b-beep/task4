# 共通知＆人物マップ

音声（Web Speech API）で訪問記録を残し、OpenAI API で要約・自動タグ付けして、人物・タグ・案件のつながりを「人物マップ」でたどるアプリ。
仕様の原本は `docs/spec.md`。

## 構成

| 層 | 技術 | デプロイ先 |
|---|---|---|
| `frontend/` | Next.js 16（App Router, TypeScript, Tailwind v4）**静的エクスポート固定** | Azure Static Web Apps（Free） |
| `api/` | FastAPI + SQLAlchemy 2 + Alembic | App Service Web アプリ `app-kyotsuchi-map-api`（起動: `sh startup.sh`）。`function_app.py` で Azure Functions にも載せられる |
| DB | ローカル: SQLite（既定）または Docker の MySQL 8 ／ 本番: `gen12-mysql-step42` の `kyotsuchi_map` | |

デプロイ先の詳細は `docs/azure-setup.md`。Tech0 のポリシーで App Service プラン・MySQL サーバー・Function App は新規作成できないため、共有の既存リソースに載せている（他チームの DB・アプリに触れないこと）。

SWA は Free プランのため「リンクされたバックエンド」は使えない。フロントは `NEXT_PUBLIC_API_BASE_URL`（ビルド時に埋め込み）で API を直接呼び、CORS は FastAPI の `CORSMiddleware`（環境変数 `CORS_ORIGINS`）で許可する。ポータル側の CORS 設定とは二重にしないこと。想定外の例外は CORS の内側のミドルウェアで 500 にしている（500 でも CORS ヘッダーが付くように）。

## 守ること

- Next.js は `output: "export"`。SSR / Server Actions / Route Handlers / `cookies()` / rewrites は使わない。データはすべてクライアントから `src/lib/api.ts` 経由で取得する。
- `frontend/AGENTS.md` のとおり、この Next.js は学習データより新しい。API を使う前に `frontend/node_modules/next/dist/docs/` を確認する。
- API のパスはすべて `/api/...`（`host.json` の `routePrefix` は `""`）。
- JSON は camelCase（`app/schemas.py` の `CamelModel`）。フロントの型は `frontend/src/lib/types.ts` と一致させる。
- DB スキーマを変えたら Alembic でマイグレーションを作る（`python -m alembic revision --autogenerate -m "..."`）。MySQL 互換を保つ（`String` は長さ指定、日時の既定値は `sa.func.now()`）。
- OpenAI API キーはサーバー側のみ。未設定時は `app/services/ai.py` のモック（キーワード一致）で同じ形のレスポンスを返す。
- カテゴリーの色だけで意味を伝えない（必ずカテゴリー名を併記）。共通の趣味だけでは「面識あり」と表示しない（破線＋「未確認」）。
- サンプルデータはすべて架空。Salesforce 連携はモックで、表示に「サンプル」を付ける。

## ローカル開発（Windows）

```powershell
# API（初回）
cd api
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
$env:DISABLE_SQLALCHEMY_CEXT='1'; .\.venv\Scripts\python -m pip install --force-reinstall --no-deps --no-binary sqlalchemy "sqlalchemy>=2.0.36"
copy .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m app.seed            # --reset で入れ直し

# API 起動（どちらか）
.\.venv\Scripts\python -m uvicorn app.main:app --port 7071 --reload
func start                                     # Functions ホストで動かす場合（local.settings.json が必要）

# テスト
.\.venv\Scripts\python -m pytest -q

# フロント
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # out/ に静的出力
npx next typegen; npx tsc --noEmit; npx eslint src   # typegen なしだと LayoutProps が見つからない（CI で再現済み）
```

### このPC固有の注意

- Windows の「スマート アプリ コントロール」が未署名のネイティブ拡張（.pyd）や venv 内の `.exe` をブロックする。
  - コマンドは `alembic` ではなく `python -m alembic`、`uvicorn` ではなく `python -m uvicorn` のように `python -m` で実行する。
  - SQLAlchemy は C 拡張なしで入れ直す（上記コマンド）。
  - `openai` SDK は依存の `jiter` がブロックされるため使わず、`httpx` で Chat Completions API を直接呼んでいる。
- `alembic.ini` は ASCII のみにする（cp932 で読まれるため日本語コメント不可）。
- ポート 3000 / 7071 を別プロジェクトが使っていることがある。その場合は `npm run dev -- -p 3001`、`--port 7072` などに変え、`CORS_ORIGINS` と `NEXT_PUBLIC_API_BASE_URL` も合わせる。

## デプロイ

`docs/azure-setup.md` と `.github/workflows/` を参照。DB のパスワードは `api/.env.azure`（git 対象外）にユーザー自身が書き、`api/scripts/setup-azure-db.ps1` で Web アプリ設定に入れる。Claude はパスワードを扱わない。
`!` で実行するコマンドは bash 経由になるため、Windows のパスは `C:/task4/...` のように `/` で書く。

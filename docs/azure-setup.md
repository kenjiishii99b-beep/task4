# Azure 環境（デプロイ済みの構成と手順）

## 実際の構成（2026-11-16 時点）

Tech0 の受講生用ポリシー（`Tech0_受講生RGガードレール`）により、リソースグループ `rg-001-gen12` では
App Service プラン・MySQL サーバー・Container Apps などを新規作成できない。そのため既存の共有リソースに載せている。

| 役割 | リソース | 備考 |
|---|---|---|
| 画面 | Static Web App `swa-kyotsuchi-map`（Free, East Asia） | https://nice-mushroom-0cbe99700.6.azurestaticapps.net |
| API | Web アプリ `app-kyotsuchi-map-api`（Python 3.13, Linux） | 既存プラン `asp-gen12-step4-sony`（B1, 他チームと共有）上。https://app-kyotsuchi-map-api.azurewebsites.net |
| DB | `gen12-mysql-step42` のデータベース `kyotsuchi_map` | 既存の `person_map` などとは別 DB。ファイアウォールはプランの外向き IP（person-map-api-1〜31）で許可済み |

Azure Functions（Flex Consumption）はポリシーで作成できないため使っていない。`api/function_app.py` と `host.json` は残してあり、
Functions が使える環境ならそのまま Function App にデプロイできる。

### Web アプリの設定

- 起動コマンド: `sh startup.sh`（`alembic upgrade head` → `python -m app.seed`（空のときだけ投入）→ uvicorn :8000）
- アプリ設定: `SCM_DO_BUILD_DURING_DEPLOYMENT=true` / `WEBSITES_PORT=8000` / `MYSQL_SSL=true` / `OPENAI_MODEL` / `CORS_ORIGINS=<SWA の URL>` / `DATABASE_URL`
- `DATABASE_URL`（パスワードを含む）は `api/.env.azure` に `DB_PASSWORD=` を書き、
  `powershell -ExecutionPolicy Bypass -File api/scripts/setup-azure-db.ps1` で設定する（パスワードは表示されない）。
- OpenAI を有効にするとき: Azure ポータルの Web アプリ「環境変数」に `OPENAI_API_KEY` を追加して保存（自動で再起動）。

## 再デプロイ

### API

```powershell
cd api
# .venv / tests / scripts / local.db / .env* を除いて zip にする
.\.venv\Scripts\python -c "import os,zipfile;sd={'.venv','tests','.pytest_cache','__pycache__','scripts'};z=zipfile.ZipFile('../api.zip','w',zipfile.ZIP_DEFLATED);[z.write(os.path.join(d,f),os.path.relpath(os.path.join(d,f))) for d,ds,fs in os.walk('.') if not ds.__setitem__(slice(None),[x for x in ds if x not in sd]) for f in fs if not (f.startswith('.env') or f.startswith('local.settings') or f.endswith(('.db','.pyc')) or f=='requirements-dev.txt')];z.close()"
az webapp deploy -g rg-001-gen12 -n app-kyotsuchi-map-api --src-path <zipのパス> --type zip --async true
az webapp log deployment list -g rg-001-gen12 -n app-kyotsuchi-map-api --query "[0].{status:status,complete:complete}"
# status=4, complete=true で完了（ビルドに 3〜8 分）。az が 504 を返してもビルドは続いている
```

### 画面

```powershell
cd frontend
$env:NEXT_PUBLIC_API_BASE_URL = "https://app-kyotsuchi-map-api.azurewebsites.net"
npm run build
npx -y @azure/static-web-apps-cli@2.0.7 deploy ./out --app-name swa-kyotsuchi-map --resource-group rg-001-gen12 --subscription-id (az account show --query id -o tsv) --env production
```

SWA CLI は Azure CLI のログインで認証する（デプロイトークン不要）。`frontend/.env` にサブスクリプション ID とテナント ID が保存される（git 対象外）。

### GitHub Actions

| ワークフロー | 動くとき | 内容 |
|---|---|---|
| `frontend-swa.yml` | `frontend/` を変更して main に push | 型チェック・lint・ビルドして SWA へ自動デプロイ |
| `api-test.yml` | `api/` を変更して push / PR | テストのみ。API のデプロイは上の手順で手動 |

API を自動デプロイしないのは、発行プロファイルに必要な Web アプリの SCM 基本認証を無効のままにするため（共有環境のため設定を緩めない）。

画面の自動デプロイには、リポジトリの Settings > Secrets and variables > Actions に次を登録する。

| 種類 | 名前 | 値 |
|---|---|---|
| Variable | `API_BASE_URL` | `https://app-kyotsuchi-map-api.azurewebsites.net` |
| Secret | `AZURE_STATIC_WEB_APPS_API_TOKEN` | `az staticwebapp secrets list -n swa-kyotsuchi-map -g rg-001-gen12 --query properties.apiKey -o tsv`（自分のターミナルで実行し、チャットには貼らない） |

## 注意

- `asp-gen12-step4-sony` は他チームのアプリと CPU・メモリを共有している。重い処理を入れない。
- `gen12-mysql-step42` には他チームの DB もある。`kyotsuchi_map` 以外に触れない。
- 後で SWA Standard にしてリンクされたバックエンドにする場合は、`API_BASE_URL` を空にしてフロントから相対パス `/api/...` で呼ぶ（CORS 不要）。

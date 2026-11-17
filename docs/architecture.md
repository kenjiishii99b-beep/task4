# アーキテクチャ

2026-11-17 時点の構成。処理の順番は [sequence.md](sequence.md)、Azure の設定と手順は [azure-setup.md](azure-setup.md) を参照。

## 1. 全体構成

```mermaid
flowchart TB
    subgraph Client["利用者の端末"]
        UI["画面（Google Chrome）<br>Next.js 静的エクスポート<br>React・SVG の人物マップ"]
        Speech["Web Speech API<br>音声 → 文字（ブラウザ内）"]
        UI <--> Speech
    end

    subgraph Azure["Azure（rg-001-gen12）"]
        SWA["Static Web Apps<br>swa-kyotsuchi-map<br>Free / East Asia<br>HTML・JS を配るだけ"]
        subgraph Plan["共有プラン（B1）"]
            API["Web アプリ<br>app-kyotsuchi-map-api<br>Python 3.13 / FastAPI<br>プラン: asp-gen12-step4-sony"]
        end
        subgraph MySQL["共有 MySQL"]
            DB[("kyotsuchi_map<br>サーバー: gen12-mysql-step42")]
        end
        AOAI["Azure OpenAI<br>oai-tvmvp-73bb<br>デプロイ gpt-4o（Japan East）"]
    end

    OpenAI["OpenAI API<br>（予備。Azure 設定がないときに使用）"]

    UI -- "① 画面の取得（HTTPS）" --> SWA
    UI -- "② データの読み書き fetch /api/...<br>（別ドメインのため CORS で許可）" --> API
    API -- "SQLAlchemy + PyMySQL<br>SSL 必須・プランの外向き IP を許可" --> DB
    API -- "要約・自動タグ付け<br>Chat Completions（Structured Outputs）" --> AOAI
    API -. "予備" .-> OpenAI
```

| 要素 | 役割 | 秘密情報 |
|---|---|---|
| 画面（ブラウザ） | 表示と操作、音声認識。API の URL はビルド時に埋め込み（`NEXT_PUBLIC_API_BASE_URL`） | 持たない |
| Static Web Apps | 静的ファイルの配信のみ（計算はしない） | なし |
| Web アプリ（API） | 唯一の窓口。DB と AI にアクセスできるのはここだけ | `DATABASE_URL`、`AZURE_OPENAI_API_KEY` などを環境変数で保持 |
| MySQL | 人物・タグ・案件・紐づけ・人間関係・メモを保存 | ― |
| Azure OpenAI | 文字起こしの要約、タグの提案（名寄せ） | ― |

## 2. ソフトウェアの層

```mermaid
flowchart TB
    subgraph FE["frontend/（ブラウザ）"]
        direction TB
        Pages["画面 src/app/<br>page.tsx（ホーム）・record・confirm・tagging・map"]
        Comps["部品 src/components/<br>map/GraphCanvas（d3-force + SVG）・DetailView・SearchBox・MemoModal<br>ViewMode（PC/スマホ切替）・ui"]
        Lib["共通処理 src/lib/<br>api.ts（API 呼び出し）・graph.ts（索引・表示範囲・検索）<br>useSpeech.ts（音声認識）・flow.ts（画面間の受け渡し）・types.ts"]
        Pages --> Comps --> Lib
        Pages --> Lib
    end

    subgraph BE["api/（App Service）"]
        direction TB
        Main["main.py<br>CORS・例外を JSON にするミドルウェア"]
        Routers["routers.py<br>/api/health・graph・summarize・auto-tag<br>knowledge・persons・person-tags・memos"]
        subgraph Services["services/"]
            Knowledge["knowledge.py<br>登録・人物照合・紐づけ・メモ・編集"]
            AI["ai.py<br>要約・タグ付け・名寄せ補正<br>Azure OpenAI / OpenAI / モック"]
        end
        Models["models.py（テーブル定義）・schemas.py（入出力 camelCase）<br>db.py（接続）・config.py（環境変数）"]
        Main --> Routers --> Knowledge --> Models
        Routers --> AI
        Knowledge --> AI
        Boot["startup.sh（起動時）<br>alembic upgrade → app.seed（空のときだけ）→ uvicorn"]
    end

    Lib -- "HTTPS / JSON" --> Routers
    Models --> L_DB[("MySQL")]
    AI --> L_LLM["Azure OpenAI"]
```

## 3. デプロイの流れ

```mermaid
flowchart LR
    Dev["開発 PC<br>C:\task4"] -- git push --> GH["GitHub<br>kenjiishii99b-beep/task4"]

    GH -- "frontend/ の変更" --> WF1["Actions: frontend-swa.yml<br>npm ci → next typegen → tsc → eslint<br>→ build（API の URL を埋め込み）"]
    WF1 -- "out/ をアップロード" --> D_SWA["Static Web Apps"]

    GH -- "api/ の変更" --> WF2["Actions: api-test.yml<br>pytest（テストのみ）"]

    Dev -- "az webapp deploy（zip・手動）" --> Kudu["App Service のビルド<br>pip install"]
    Kudu --> D_API["Web アプリ"]
    D_API -- "起動時 startup.sh" --> Mig["テーブル作成・初期データ"]
    Mig --> D_DB[("MySQL")]

    Secrets["秘密情報<br>（ポータルの環境変数で利用者が設定）<br>DATABASE_URL・AZURE_OPENAI_API_KEY"] -.-> D_API
```

API を自動デプロイしないのは、発行プロファイルに必要な基本認証を、共有環境の Web アプリで有効にしないため。

## 4. データモデル

```mermaid
erDiagram
    persons ||--o{ person_tags : "持つ"
    tags ||--o{ person_tags : "付く"
    tags ||--o| projects : "案件の商談情報"
    persons ||--o{ memos : "根拠メモ"
    persons ||--o{ person_relations : "from"
    persons ||--o{ person_relations : "to"
    persons ||--o{ projects : "商談所有者"

    persons {
        string id PK
        string name
        string short_name
        string company
        string dept_title
        string sf_contact_id
        text summary
    }
    tags {
        string id PK
        string category "project/hobby/interest/expertise/challenge/goal"
        string label UK
    }
    person_tags {
        string id PK
        string person_id FK
        string tag_id FK
        string reason "関わる理由"
        string detail_role "この人にとっての関わり方"
        string detail_label
        json source_ids "根拠メモの ID"
    }
    person_relations {
        string id PK
        string from_id FK
        string to_id FK
        string label
        bool confirmed "false は「未確認」（破線）"
    }
    memos {
        string id PK
        string person_id FK
        date date
        text quote "本人の発言"
        text interpretation "登録者の解釈"
        bool confirmed_by_registrar
        json tag_ids
    }
    projects {
        string id PK
        string tag_id FK
        string name
        int amount
        string stage
        date close_date
        string owner_id FK
        json roles "登録済みの役割のみ"
    }
```

- 人と人は、主に **タグを介して** つながる（`persons` — `person_tags` — `tags`）。同じタグでも、人ごとの関わり方は `person_tags.detail_role` で区別する。
- 直接の人間関係は `person_relations`。共通の趣味だけの接点は `confirmed = false` として「未確認」と表示する。
- 案件はタグの一種（`category = project`）として扱い、商談情報は `projects` に持つ。

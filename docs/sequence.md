# シーケンス図

実装（2026-11-16 時点）の処理順に合わせた図。登場するもの:

| 名前 | 実体 |
|---|---|
| ブラウザ | Next.js（静的エクスポート）。Azure Static Web Apps から配信 |
| Web Speech API | Chrome 組み込みの音声認識（`webkitSpeechRecognition`） |
| API | FastAPI（App Service `app-kyotsuchi-map-api`） |
| OpenAI | Chat Completions API（`OPENAI_MODEL`、Structured Outputs） |
| DB | Azure Database for MySQL（`kyotsuchi_map`） |

画面間のデータ受け渡しは `sessionStorage`（`frontend/src/lib/flow.ts`）。

## 1. 記録の登録（録音 → 要約 → 確認 → 登録・自動タグ付け）

```mermaid
sequenceDiagram
    autonumber
    actor U as 利用者
    participant B as ブラウザ（Next.js）
    participant S as Web Speech API
    participant A as API（FastAPI）
    participant O as OpenAI
    participant D as DB（MySQL）

    Note over U,B: ホーム画面
    U->>B: マイクボタンをタップ
    B->>B: getUserMedia でマイク権限を確認
    B->>B: 録音画面（/record/）へ遷移

    Note over U,S: 録音・文字起こし画面
    B->>S: start()（ja-JP, continuous, interimResults）
    loop 話している間（最大 30 秒）
        U->>S: 話す
        S-->>B: onresult（確定テキスト／途中テキスト）
        B-->>U: 確定は白、途中は灰色でリアルタイム表示
        opt 無音で認識が止まった（30 秒未満・停止前）
            S-->>B: onend
            B->>S: start() で再接続
        end
    end
    U->>B: 停止ボタン（または 30 秒経過）
    B->>S: stop()

    B->>A: POST /api/summarize（文字起こし全文）
    alt OPENAI_API_KEY あり
        A->>O: 要約抽出（JSON Schema: 会社・氏名・部署・役職・発言・解釈）
        O-->>A: 要約 JSON
    else キー未設定
        A->>A: 正規表現による簡易抽出（モック）
    end
    A->>A: 氏名から役職・敬称を分離（田中部長 → 田中／部長）
    A-->>B: 要約＋mode（openai / mock）
    B->>B: sessionStorage に下書き保存 → 要約確認画面へ

    Note over U,B: 要約確認・修正画面
    opt 修正する
        U->>B: 「修正する」→ 編集 →「修正を確定」
    end
    U->>B: 「共通知に登録」

    B->>A: POST /api/knowledge（要約＋文字起こし）
    A->>D: 人物を検索（氏名・姓・会社名）
    alt 見つかった
        D-->>A: 既存の人物
    else 見つからない
        A->>D: INSERT persons（新規人物）
    end
    A->>D: INSERT memos（発言・解釈、登録者確認済み）
    A->>D: SELECT tags（既存タグ一覧）
    D-->>A: 既存タグ
    alt OPENAI_API_KEY あり
        A->>O: 自動タグ付け（要約＋文字起こし＋既存タグ一覧）
        O-->>A: タグ候補（既存タグへの名寄せ／新規、関わり方、理由）
    else キー未設定
        A->>A: 既存タグとのキーワード一致（モック）
    end
    A->>A: 名寄せの補正（存在しない ID・同名タグ・重複を整理）
    loop タグ候補ごと
        opt 新規タグ
            A->>D: INSERT tags
        end
        A->>D: person_tags を作成／更新（理由・関わり方・根拠メモ）
    end
    A->>D: memos.tag_ids を更新 → COMMIT
    A-->>B: 201 人物・メモ・付与タグ・新規人物か
    B->>B: sessionStorage に結果保存 → タグ付け結果画面へ
    B-->>U: 「登録完了しました」＋付与されたタグ一覧
```

エラー時: OpenAI の失敗は 502、入力不備は 400、その他は 500（いずれも CORS ヘッダー付きで返し、画面に理由を表示する）。

## 2. タグ付け結果の調整

```mermaid
sequenceDiagram
    autonumber
    actor U as 利用者
    participant B as ブラウザ（タグ付け結果画面）
    participant A as API（FastAPI）
    participant D as DB（MySQL）

    alt 「この人にとっては」のカテゴリーを変更
        U->>B: 例：関心ごと → 課題・困りごと
        B->>A: PATCH /api/person-tags/{id}（detailRole）
        A->>D: person_tags.detail_role を更新
        opt このタグを使っているのがこの人だけ
            A->>D: tags.category も合わせて更新
        end
        A-->>B: 更新後の紐づけ
    else 「このタグを外す」
        U->>B: 外す
        B->>A: DELETE /api/person-tags/{id}
        A->>D: person_tags を削除
        opt 誰も使わなくなった（案件以外の）タグ
            A->>D: tags を削除
        end
        A-->>B: 204
    else タグを追加
        U->>B: タグ名・カテゴリー・理由を入力
        B->>A: POST /api/person-tags
        A->>D: 同名タグを検索（なければ INSERT tags）
        A->>D: person_tags を作成
        A-->>B: 201 付与タグ
    end
    U->>B: 「人物マップで反映を確認する」
    B->>B: /map/?select=人物ID へ遷移（図 3 へ）
```

## 3. 人物マップの表示と探索

```mermaid
sequenceDiagram
    autonumber
    actor U as 利用者
    participant B as ブラウザ（人物マップ）
    participant A as API（FastAPI）
    participant D as DB（MySQL）

    U->>B: /map/ を開く（?select= または ?q= 付き）
    B->>A: GET /api/graph
    A->>D: persons / tags / projects / person_tags / person_relations / memos を取得
    D-->>A: 全データ
    A-->>B: グラフ JSON（camelCase）
    B->>B: buildIndex（人物↔タグの索引を作る）
    B->>B: initialVisible（中心人物＋近い人物・タグに絞る。PC 6人/7タグ、スマホ 4人/5タグ）
    B->>B: d3-force で配置を計算 → SVG 描画
    B-->>U: マップ＋詳細パネル

    loop 探索
        alt ノードをクリック／検索候補を選択
            U->>B: 人物・タグ・案件を選ぶ
            B->>B: 選択履歴に追加し、隣接ノードを表示対象に追加
            B->>B: 前回位置を保ったまま再配置、選択ノード以外を薄く表示
            B-->>U: 詳細（人物／タグ／案件）を表示
        else カテゴリーで絞り込み
            U->>B: チップを選ぶ
            B->>B: 他カテゴリーを非表示、表示中の人物の該当タグを追加
        else 「← 前の表示へ戻る」
            U->>B: 戻る
            B->>B: 選択履歴を 1 つ戻す
        end
    end

    opt 人物情報の編集（人物詳細パネルの「編集」）
        U->>B: 氏名・会社名・部署・役職・要約を直して「保存」
        B->>A: PATCH /api/persons/{id}（変更した項目）
        A->>D: persons を更新
        A-->>B: 更新後の人物
        B->>A: GET /api/graph（再読み込み）
        A-->>B: 最新のグラフ
    end

    opt 根拠メモ・テキストメモ
        U->>B: 「根拠のメモを見る」／「＋ メモ」
        B->>A: POST /api/memos（または PATCH /api/memos/{id}/confirm）
        A->>D: memos・person_tags を更新
        A-->>B: 結果
        B->>A: GET /api/graph（再読み込み）
        A-->>B: 最新のグラフ
    end
```

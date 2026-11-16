"""仕様書 4.2 の初期サンプルデータ（すべて架空）を投入する。

    python -m app.seed          # データが空のときだけ投入
    python -m app.seed --reset  # 全データを消して投入し直す
"""

import sys
from datetime import date, datetime

from sqlalchemy import delete, select

from app import models
from app.db import SessionLocal

# (id, 氏名, 会社, 部署・役職, SF Contact ID, 要約)
PERSONS = [
    ("p-tanaka", "田中 健一", "東都設備株式会社", "設備部長", "0035g00000Sample01", "設備更新の最終判断者。電気代の予算圧迫を強く気にしており、省エネ投資に前向き。"),
    ("p-nakamura", "中村 彩", "東都設備株式会社", "開発部", "0035g00000Sample02", "次期IRで発信できる環境施策を探している。Scope2 の可視化に関心。"),
    ("p-ito", "伊藤 修", "自社", "技術担当", None, "高効率ポンプの導入実績が豊富。ポンプ入替工事の技術支援・試算を担当。"),
    ("p-sato", "佐藤 美咲", "東都設備株式会社", "購買課長", "0035g00000Sample03", "購買契約の窓口。相見積もり基準を厳格化している。"),
    ("p-takahashi", "高橋 遥", "自社", "営業担当", None, "ポンプ入替工事の商談所有者。設備更新案件のクロージングが得意。"),
    ("p-suzuki", "鈴木 大輔", "東都設備株式会社", "工場長", "0035g00000Sample04", "突発停止リスクをゼロにしたい。現場オペレーターの多能工化にも熱心。"),
    ("p-yamamoto", "山本 恵子", "東都設備株式会社", "経理財務部長", "0035g00000Sample05", "固定費比率の上昇を抑えたい。省エネ投資は補助金で初期費用を圧縮したい考え。"),
    ("p-watanabe", "渡辺 誠", "京浜マテリアル株式会社", "生産技術部長", "0035g00000Sample06", "コンプレッサーの電力ロス削減を検討中。空圧機器リプレイスの技術評価責任者。"),
    ("p-kobayashi", "小林 由美", "京浜マテリアル株式会社", "サステナビリティ推進室", "0035g00000Sample07", "統合報告書に掲載できる KPI を探している。再エネと省エネの連携に関心。"),
    ("p-kato", "加藤 隆司", "京浜マテリアル株式会社", "資材調達グループ長", "0035g00000Sample08", "原材料高騰で設備予算を見直し中。発注決裁ルートを管理。"),
    ("p-yoshida", "吉田 健太", "自社", "ソリューション営業部 課長", None, "空圧機器リプレイス案件の商談所有者。省エネ補助金の申請サポート実績あり。"),
    ("p-yamada", "山田 直樹", "関東ロジスティクス株式会社", "施設管理部長", "0035g00000Sample09", "冷凍冷蔵倉庫の 24 時間稼働による電気代が課題。冷凍機更新の意思決定者。"),
    ("p-sasaki", "佐々木 麻衣", "関東ロジスティクス株式会社", "経営企画室", "0035g00000Sample10", "2030 年の CO2 削減ロードマップを策定中。冷凍機更新の稟議担当。"),
    ("p-yamaguchi", "山口 浩二", "関東ロジスティクス株式会社", "現場保全リーダー", "0035g00000Sample11", "冷媒フロン規制への早期対応と、ベテラン退職後の保全体制づくりが課題。"),
    ("p-matsumoto", "松本 翔太", "自社", "エネルギー診断チーム リーダー", None, "熱源・搬送動力のトータル診断が得意。冷凍機・空調更新の提案主担当。"),
    ("p-inoue", "井上 真由美", "中央フードテック株式会社", "品質保証部長", "0035g00000Sample12", "空調・換気のクリーン化で HACCP 対応を強化したい。"),
    ("p-kimura", "木村 拓也", "中央フードテック株式会社", "製造部 部長", "0035g00000Sample13", "蒸気ボイラーの燃費悪化とメンテナンス負荷に悩んでいる。ボイラー案件の意思決定者。"),
    ("p-hayashi", "林 智子", "中央フードテック株式会社", "総務人事部長", "0035g00000Sample14", "製造現場の DX リテラシー教育を推進。助成金の調査も担当。"),
    ("p-shimizu", "清水 健介", "自社", "カスタマーサクセス担当", None, "ボイラー案件の導入後フォロー担当。食品工場向けの稼働モニタリング支援が得意。"),
    ("p-mori", "森 亮太", "自社", "事業開発部 マネージャー", None, "脱炭素ソリューションの新規パッケージ化を担当。複数拠点企業への横展開が得意。"),
]

TAGS = [
    ("t-energy", "interest", "省エネ"),
    ("t-training", "interest", "若手育成"),
    ("t-carbon", "interest", "カーボンニュートラル"),
    ("t-budget", "challenge", "電気代が予算を圧迫"),
    ("t-aging", "challenge", "老朽化設備の更新"),
    ("t-cost", "challenge", "コスト最適化"),
    ("t-ir", "goal", "IRで発信できる施策"),
    ("t-subsidy", "goal", "補助金・税制優遇の活用"),
    ("t-haccp", "goal", "HACCP・衛生管理強化"),
    ("t-pump-exp", "expertise", "高効率ポンプの提案経験"),
    ("t-sales-exp", "expertise", "法人深耕営業"),
    ("t-fishing", "hobby", "釣り"),
    ("t-golf", "hobby", "ゴルフ"),
    ("t-marathon", "hobby", "マラソン"),
    ("t-sauna", "hobby", "サウナ"),
    ("t-cafe", "hobby", "カフェ巡り"),
    ("t-yoga", "hobby", "ヨガ・ピラティス"),
    ("t-art", "hobby", "美術館巡り"),
    ("t-camp", "hobby", "キャンプ"),
    ("t-cooking", "hobby", "料理・パン作り"),
    ("o-pump", "project", "ポンプ入替工事"),
    ("o-air", "project", "空圧機器リプレイス案件"),
    ("o-fridge", "project", "冷凍機・空調更新プロジェクト"),
    ("o-boiler", "project", "ボイラー高効率化案件"),
]

# (人物, タグ, この人物にとっての関わり方, 関わる理由, 関わり方の具体ラベル)
PERSON_TAGS = [
    ("p-tanaka", "t-energy", "challenge", "予算圧迫を解消したい", "電気代が予算を圧迫"),
    ("p-tanaka", "t-fishing", "hobby", "週末は海釣りに行く", None),
    ("p-tanaka", "o-pump", "project", "登録済みの意思決定者", None),
    ("p-nakamura", "t-energy", "goal", "IR向けの施策を探したい", "IRで発信できる施策"),
    ("p-nakamura", "t-ir", "goal", "次期IRでの環境取り組み発信", None),
    ("p-nakamura", "t-carbon", "interest", "Scope2排出量の可視化", None),
    ("p-ito", "t-energy", "expertise", "高効率化の提案経験", "高効率ポンプの提案経験"),
    ("p-ito", "t-pump-exp", "expertise", "同規模工場での導入実績あり", None),
    ("p-ito", "o-pump", "project", "技術支援・試算担当", None),
    ("p-sato", "t-fishing", "hobby", "最近、船釣りを始めた", None),
    ("p-sato", "t-cost", "challenge", "相見積もり基準の厳格化", None),
    ("p-sato", "o-pump", "project", "購買契約窓口", None),
    ("p-takahashi", "o-pump", "project", "商談所有者", None),
    ("p-takahashi", "t-sales-exp", "expertise", "設備更新案件のクロージング", None),
    ("p-takahashi", "t-cafe", "hobby", "休日はロースタリー巡り", None),
    ("p-suzuki", "t-aging", "challenge", "突発停止リスクをゼロにしたい", None),
    ("p-suzuki", "t-training", "interest", "現場オペレーターの多能工化", None),
    ("p-suzuki", "t-golf", "hobby", "月1回の社内コンペ幹事", None),
    ("p-yamamoto", "t-budget", "challenge", "固定費比率の上昇を抑制したい", None),
    ("p-yamamoto", "t-subsidy", "goal", "省エネ投資の初期費用圧縮", None),
    ("p-yamamoto", "t-yoga", "hobby", "週2回のスタジオ通い", None),
    ("p-watanabe", "t-energy", "challenge", "コンプレッサーの電力ロス削減", "コンプレッサーの電力ロス"),
    ("p-watanabe", "t-fishing", "hobby", "渓流ルアーフィッシング", None),
    ("p-watanabe", "o-air", "project", "技術評価責任者", None),
    ("p-kobayashi", "t-ir", "goal", "統合報告書へのKPI掲載", None),
    ("p-kobayashi", "t-carbon", "interest", "再エネ比率向上と省エネ連携", None),
    ("p-kobayashi", "t-art", "hobby", "現代アート展の鑑賞", None),
    ("p-kato", "t-cost", "challenge", "原材料高騰に伴う設備予算見直し", None),
    ("p-kato", "o-air", "project", "発注決裁ルート管理", None),
    ("p-kato", "t-marathon", "hobby", "フルマラソン完走目標", None),
    ("p-yoshida", "o-air", "project", "商談所有者", None),
    ("p-yoshida", "t-subsidy", "expertise", "省エネ補助金申請サポート実績", None),
    ("p-yoshida", "t-golf", "hobby", "顧客とのラウンド交流", None),
    ("p-yamada", "t-budget", "challenge", "冷凍冷蔵倉庫の24時間稼働電力", None),
    ("p-yamada", "o-fridge", "project", "登録済みの意思決定者", None),
    ("p-yamada", "t-camp", "hobby", "家族でのオートキャンプ", None),
    ("p-sasaki", "t-carbon", "goal", "2030年CO2削減ロードマップ策定", None),
    ("p-sasaki", "o-fridge", "project", "投資対効果の社内稟議担当", None),
    ("p-sasaki", "t-cafe", "hobby", "スペシャルティコーヒー愛好", None),
    ("p-yamaguchi", "t-aging", "challenge", "冷媒フロン規制への早期対応", None),
    ("p-yamaguchi", "t-training", "challenge", "ベテラン保全担当の定年退職対策", None),
    ("p-yamaguchi", "t-sauna", "hobby", "週末のサウナ巡り", None),
    ("p-matsumoto", "o-fridge", "project", "省エネ診断・提案主担当", None),
    ("p-matsumoto", "t-pump-exp", "expertise", "熱源・搬送動力のトータル診断", None),
    ("p-matsumoto", "t-sauna", "hobby", "出張先でのローカルサウナ開拓", None),
    ("p-inoue", "t-haccp", "goal", "空調・換気システムのクリーン化", None),
    ("p-inoue", "o-boiler", "project", "品質基準レビュー担当", None),
    ("p-inoue", "t-cooking", "hobby", "休日の天然酵母パン作り", None),
    ("p-kimura", "t-aging", "challenge", "蒸気ボイラーの燃費悪化とメンテナンス負荷", None),
    ("p-kimura", "o-boiler", "project", "登録済みの意思決定者", None),
    ("p-kimura", "t-marathon", "hobby", "市民ランナーとして大会出場", None),
    ("p-hayashi", "t-training", "goal", "製造現場のDXリテラシー教育", None),
    ("p-hayashi", "t-subsidy", "interest", "人材開発・省エネ関連助成金の調査", None),
    ("p-hayashi", "t-yoga", "hobby", "健康経営推進の一環で実践", None),
    ("p-shimizu", "o-boiler", "project", "導入後フォロー・運用定着担当", None),
    ("p-shimizu", "t-haccp", "expertise", "食品工場向け稼働モニタリング支援", None),
    ("p-shimizu", "t-camp", "hobby", "ソロキャンプ道具収集", None),
    ("p-mori", "t-carbon", "goal", "脱炭素ソリューションの新規パッケージ化", None),
    ("p-mori", "t-sales-exp", "expertise", "複数拠点展開企業への横展開戦略", None),
    ("p-mori", "t-art", "hobby", "建築・デザイン展の視察", None),
]

# 直接の人間関係（confirmed=True）と、共通点があるだけの未確認の接点（confirmed=False）
RELATIONS = [
    ("r-1", "p-tanaka", "p-takahashi", "商談窓口", True),
    ("r-2", "p-tanaka", "p-nakamura", "よく相談", True),
    ("r-3", "p-tanaka", "p-sato", "購買手続きで連携", True),
    ("r-4", "p-tanaka", "p-suzuki", "よく相談", True),
    ("r-5", "p-ito", "p-takahashi", "同じ案件チーム", True),
    ("r-6", "p-watanabe", "p-yoshida", "商談窓口", True),
    ("r-7", "p-kato", "p-yoshida", "商談窓口", True),
    ("r-8", "p-yamada", "p-matsumoto", "商談窓口", True),
    ("r-9", "p-sasaki", "p-yamada", "よく相談", True),
    ("r-10", "p-kimura", "p-shimizu", "導入後フォロー", True),
    ("r-11", "p-inoue", "p-kimura", "よく相談", True),
    ("r-12", "p-tanaka", "p-watanabe", "釣りの話題が共通", False),
    ("r-13", "p-nakamura", "p-kobayashi", "IR施策のテーマが共通", False),
]

# (id, 人物, 日付, 状況, 登録者, 本人の発言, 登録者の解釈, 確認済み, タグ)
MEMOS = [
    ("m-tanaka-1", "p-tanaka", date(2026, 10, 28), "定例訪問（設備部）", "高橋 遥",
     "「電気代が上がって、設備部の予算がかなり圧迫されている。省エネになるなら更新を前倒ししたい」",
     "予算圧迫の解消が最優先。省エネ効果を金額で示せればポンプ入替の判断が早まりそう。", True, ["t-energy", "o-pump"]),
    ("m-tanaka-2", "p-tanaka", date(2026, 11, 5), "打合せ後の雑談", "高橋 遥",
     "「週末はだいたい海釣り。最近は朝マズメ狙いで早起きしている」",
     "釣りの話題で打ち解けやすい。購買の佐藤さんも船釣りを始めたらしい（面識は未確認）。", True, ["t-fishing"]),
    ("m-nakamura-1", "p-nakamura", date(2026, 10, 15), "開発部ヒアリング", "高橋 遥",
     "「次のIRで環境の取り組みを出したい。数字で語れる施策があると助かる」",
     "省エネ効果を CO2 削減量に換算した資料が刺さる。", True, ["t-energy", "t-ir"]),
    ("m-ito-1", "p-ito", date(2026, 11, 1), "社内技術レビュー", "高橋 遥",
     "「同規模の工場で高効率ポンプに替えたとき、電力量は約 3 割下がった」",
     "田中部長向けの試算は伊藤さんの実績値をベースにすると説得力が出る。", True, ["t-energy", "t-pump-exp"]),
    ("m-sato-1", "p-sato", date(2026, 11, 8), "購買課での見積説明", "高橋 遥",
     "「最近、船釣りを始めたんです。相見積もりは 3 社以上が社内ルールになりました」",
     "購買基準が厳しくなっている。釣りの話題は田中部長と共通だが、二人が釣りで交流しているかは未確認。", True, ["t-fishing", "t-cost"]),
    ("m-watanabe-1", "p-watanabe", date(2026, 10, 22), "京浜マテリアル技術打合せ", "吉田 健太",
     "「コンプレッサーのエア漏れで相当な電力をロスしている。休みの日は渓流でルアーを投げてます」",
     "省エネの観点で田中部長の事例が参考になる可能性。釣りは共通点だが面識は未確認。", True, ["t-energy", "t-fishing", "o-air"]),
    ("m-suzuki-1", "p-suzuki", date(2026, 9, 30), "工場見学", "高橋 遥",
     "「突発停止だけは絶対に避けたい。若手が複数の設備を見られるようにしたい」",
     "老朽化更新と人材育成をセットで提案すると響きそう。", True, ["t-aging", "t-training"]),
    ("m-yamamoto-1", "p-yamamoto", date(2026, 10, 10), "経理財務部への予算説明", "高橋 遥",
     "「固定費の比率が上がっているのが問題。補助金が使えるなら初期費用を抑えたい」",
     "補助金スキームの提示が意思決定の後押しになる。吉田課長の申請サポート実績が使える。", False, ["t-budget", "t-subsidy"]),
    ("m-yamada-1", "p-yamada", date(2026, 10, 18), "倉庫設備ヒアリング", "松本 翔太",
     "「冷凍冷蔵倉庫は 24 時間止められない。電気代が本当に重い」",
     "夜間電力を含めた運転最適化の提案余地がある。", True, ["t-budget", "o-fridge"]),
    ("m-kimura-1", "p-kimura", date(2026, 9, 12), "ボイラー更新の定例", "清水 健介",
     "「蒸気ボイラーの燃費がどんどん悪くなって、メンテも手間がかかる」",
     "高効率ボイラーへの更新で燃費と保守負荷の両方を下げられる。", True, ["t-aging", "o-boiler"]),
]

PROJECTS = [
    dict(id="o-pump", tag_id="o-pump", sf_opportunity_id="0065g00000Opp0001", name="ポンプ入替工事", account_name="東都設備株式会社",
         amount=12_000_000, stage="提案・見積", close_date=date(2026, 12, 20), owner_id="p-takahashi",
         last_sync=datetime(2026, 11, 14, 9, 30), sf_url=None, related_tag_ids=["t-energy"],
         roles=[{"personId": "p-tanaka", "role": "登録済みの意思決定者"}, {"personId": "p-takahashi", "role": "営業担当／商談所有者"}]),
    dict(id="o-air", tag_id="o-air", sf_opportunity_id="0065g00000Opp0002", name="空圧機器リプレイス案件", account_name="京浜マテリアル株式会社",
         amount=8_500_000, stage="ヒアリング", close_date=date(2027, 2, 26), owner_id="p-yoshida",
         last_sync=datetime(2026, 11, 14, 9, 30), sf_url=None, related_tag_ids=["t-energy", "t-cost"],
         roles=[{"personId": "p-watanabe", "role": "技術評価責任者"}, {"personId": "p-yoshida", "role": "営業担当／商談所有者"}]),
    dict(id="o-fridge", tag_id="o-fridge", sf_opportunity_id="0065g00000Opp0003", name="冷凍機・空調更新プロジェクト", account_name="関東ロジスティクス株式会社",
         amount=23_000_000, stage="社内稟議", close_date=date(2027, 3, 31), owner_id="p-matsumoto",
         last_sync=datetime(2026, 11, 14, 9, 30), sf_url=None, related_tag_ids=["t-budget", "t-carbon"],
         roles=[{"personId": "p-yamada", "role": "登録済みの意思決定者"}, {"personId": "p-matsumoto", "role": "提案主担当／商談所有者"}]),
    dict(id="o-boiler", tag_id="o-boiler", sf_opportunity_id="0065g00000Opp0004", name="ボイラー高効率化案件", account_name="中央フードテック株式会社",
         amount=15_600_000, stage="受注", close_date=date(2026, 10, 30), owner_id="p-shimizu",
         last_sync=datetime(2026, 11, 14, 9, 30), sf_url=None, related_tag_ids=["t-aging", "t-haccp"],
         roles=[{"personId": "p-kimura", "role": "登録済みの意思決定者"}, {"personId": "p-shimizu", "role": "導入後フォロー担当"}]),
]


def seed(reset: bool = False) -> None:
    with SessionLocal() as db:
        if reset:
            for m in (models.Memo, models.PersonRelation, models.PersonTag, models.Project, models.Tag, models.Person):
                db.execute(delete(m))
            db.commit()
        elif db.scalar(select(models.Person.id).limit(1)):
            print("データが既にあるため投入をスキップしました（--reset で再投入）")
            return

        for pid, name, company, dept, sf, summary in PERSONS:
            db.add(models.Person(id=pid, name=name, short_name=name[0], company=company, dept_title=dept, sf_contact_id=sf, summary=summary))
        for tid, cat, label in TAGS:
            db.add(models.Tag(id=tid, category=cat, label=label))
        db.flush()
        for p in PROJECTS:
            db.add(models.Project(**p))
        for mid, pid, d, ctx, reg, quote, interp, ok, tags in MEMOS:
            db.add(models.Memo(id=mid, person_id=pid, date=d, context=ctx, registrar=reg, quote=quote,
                               interpretation=interp, confirmed_by_registrar=ok, scope="社内共有", tag_ids=tags))
        for i, (pid, tid, role, reason, dlabel) in enumerate(PERSON_TAGS, 1):
            sources = [m[0] for m in MEMOS if m[1] == pid and tid in m[8]]
            db.add(models.PersonTag(id=f"pt-{i}", person_id=pid, tag_id=tid, reason=reason, detail_role=role,
                                    detail_label=dlabel, source_ids=sources))
        for rid, a, b, label, ok in RELATIONS:
            db.add(models.PersonRelation(id=rid, from_id=a, to_id=b, label=label, confirmed=ok))
        db.commit()
        print(f"投入しました: 人物 {len(PERSONS)} / タグ・案件 {len(TAGS)} / 紐づけ {len(PERSON_TAGS)} / メモ {len(MEMOS)}")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)

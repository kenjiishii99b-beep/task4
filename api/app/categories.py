"""タグのカテゴリー定義（フロントの lib/categories.ts と同じ ID を使う）。"""

CATEGORIES: dict[str, str] = {
    "project": "案件",
    "hobby": "趣味",
    "interest": "関心ごと",
    "expertise": "経験・得意分野",
    "challenge": "課題・困りごと",
    "goal": "目的・取り組み",
}

CATEGORY_IDS = list(CATEGORIES.keys())

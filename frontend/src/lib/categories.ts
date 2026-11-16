import type { CategoryId } from "./types";

// 仕様書 2.3。色だけに頼らず、必ず表示名を併記する。
export const CATEGORIES: Record<CategoryId, { label: string; color: string }> = {
  project: { label: "案件", color: "#7CC8F8" },
  hobby: { label: "趣味", color: "#A4EDC2" },
  interest: { label: "関心ごと", color: "#F2C66D" },
  expertise: { label: "経験・得意分野", color: "#C3A3EB" },
  challenge: { label: "課題・困りごと", color: "#F39892" },
  goal: { label: "目的・取り組み", color: "#79DDD4" },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

// スマホ版で前面に出す 3 カテゴリー
export const MOBILE_FRONT_CATEGORIES: CategoryId[] = ["hobby", "interest", "project"];

export const CATEGORY_TEXT = "#0F172A";

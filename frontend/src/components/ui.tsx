import { CATEGORIES, CATEGORY_TEXT } from "@/lib/categories";
import type { CategoryId } from "@/lib/types";

/** カテゴリー色＋カテゴリー名（色だけに頼らない） */
export function CategoryBadge({ category, size = "sm" }: { category: CategoryId; size?: "xs" | "sm" }) {
  const c = CATEGORIES[category];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ background: c.color, color: CATEGORY_TEXT }}
    >
      {c.label}
    </span>
  );
}

/** タグ・案件名のピル。カテゴリー名を左に添える */
export function TagPill({ category, label, onClick }: { category: CategoryId; label: string; onClick?: () => void }) {
  const c = CATEGORIES[category];
  const inner = (
    <>
      <span className="text-[10px] opacity-75">{c.label}</span>
      <span className="font-medium">{label}</span>
    </>
  );
  const cls = "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs";
  const style = { background: c.color, color: CATEGORY_TEXT };
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:brightness-110`} style={style}>
      {inner}
    </button>
  ) : (
    <span className={cls} style={style}>
      {inner}
    </span>
  );
}

export function Avatar({ text, size = 40 }: { text: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-avatar font-medium text-fg"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {text}
    </span>
  );
}

export function MicIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-cat-challenge/50 bg-cat-challenge/10 px-3 py-2.5 text-sm text-fg">
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-sub">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-fg motion-reduce:animate-none" />
      {label}
    </div>
  );
}

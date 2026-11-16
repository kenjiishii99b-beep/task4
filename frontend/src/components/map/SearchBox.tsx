"use client";

import { useId, useState } from "react";
import { search, type GraphIndex, type SearchHit } from "@/lib/graph";
import { Avatar, CategoryBadge, SearchIcon } from "../ui";

export function SearchBox({ index, value, onChange, onPick }: { index: GraphIndex; value: string; onChange: (v: string) => void; onPick: (hit: SearchHit) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const hits = search(index, value);

  const pick = (h: SearchHit) => {
    onPick(h);
    onChange(h.label);
    setOpen(false);
  };

  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sub">
        <SearchIcon />
      </span>
      <input
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-label="人・タグ・案件を探す"
        placeholder="人・タグ・案件を探す"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="field h-10 pl-9"
      />
      {open && value.trim() && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-line bg-panel py-1 shadow-xl">
          {hits.length === 0 && <li className="px-3 py-2.5 text-sm text-sub">一致する人・タグ・案件がありません</li>}
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
                className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left ${i === active ? "bg-card" : "hover:bg-card"}`}
              >
                {h.kind === "person" ? <Avatar text={h.label[0]} size={26} /> : <CategoryBadge category={h.category!} size="xs" />}
                <span className="min-w-0">
                  <span className="block text-sm">{h.label}</span>
                  <span className="block truncate text-xs text-sub">{h.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

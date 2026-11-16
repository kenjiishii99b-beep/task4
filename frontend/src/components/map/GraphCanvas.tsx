"use client";

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_TEXT } from "@/lib/categories";
import type { GraphIndex } from "@/lib/graph";
import type { CategoryId } from "@/lib/types";

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: "person" | "tag";
}

interface Edge {
  id: string;
  source: string;
  target: string;
  kind: "personTag" | "relation";
  label: string;
  confirmed: boolean;
}

interface Props {
  index: GraphIndex;
  visible: Set<string>;
  hiddenCategories: Set<CategoryId>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
  /** 下部カードなどで隠れる高さ（全体表示の計算で避ける） */
  bottomInset?: number;
}

type View = { x: number; y: number; k: number };

const PERSON_R = 22;

function tagWidth(label: string) {
  return Math.max(56, label.length * 12.5 + 24);
}

type Layout = Map<string, { x: number; y: number }>;

function computeLayout(
  nodeIds: string[],
  edges: Edge[],
  prev: Layout,
  isPerson: (id: string) => boolean,
  tagLabel: (id: string) => string,
  compact: boolean,
): Layout {
  const nodes: (SimNode & { r: number })[] = nodeIds.map((id, i) => {
    const p = prev.get(id);
    const angle = (i / Math.max(1, nodeIds.length)) * Math.PI * 2;
    const person = isPerson(id);
    return {
      id,
      kind: person ? "person" : "tag",
      // 横長のピルも重ならないよう、幅の半分を衝突半径にする
      r: person ? 50 : tagWidth(tagLabel(id)) / 2 + 10,
      x: p?.x ?? Math.cos(angle) * 160 + ((i * 37) % 20) - 10,
      y: p?.y ?? Math.sin(angle) * 160 + ((i * 53) % 20) - 10,
    };
  });
  type Link = SimulationNodeDatum & { source: string; target: string; kind: Edge["kind"] };
  const links: Link[] = edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
  const sim = forceSimulation(nodes)
    .force(
      "link",
      forceLink<SimNode, never>(links as never)
        .id((d) => d.id)
        .distance((l) => ((l as unknown as Link).kind === "relation" ? (compact ? 150 : 200) : compact ? 125 : 165))
        .strength(0.5),
    )
    .force("charge", forceManyBody().strength(compact ? -500 : -800))
    .force("collide", forceCollide<SimNode & { r: number }>((d) => d.r).strength(1).iterations(3))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.07))
    .stop();
  sim.alpha(nodes.some((n) => prev.has(n.id)) ? 0.5 : 1);
  for (let i = 0; i < 260; i++) sim.tick();
  const pos: Layout = new Map();
  nodes.forEach((n) => pos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }));
  return pos;
}

export function GraphCanvas({ index, visible, hiddenCategories, selectedId, onSelect, compact = false, bottomInset = 0 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 表示するノード・エッジ（カテゴリー絞り込み後）
  const { nodeIds, edges } = useMemo(() => {
    const ids = [...visible].filter((id) => {
      const t = index.tag.get(id);
      if (t) return !hiddenCategories.has(t.category);
      return index.person.has(id);
    });
    const set = new Set(ids);
    const es: Edge[] = [];
    for (const pt of index.data.personTags) {
      if (set.has(pt.personId) && set.has(pt.tagId)) {
        es.push({ id: pt.id, source: pt.personId, target: pt.tagId, kind: "personTag", label: pt.reason, confirmed: true });
      }
    }
    for (const r of index.data.personRelations) {
      if (set.has(r.fromId) && set.has(r.toId)) {
        es.push({ id: r.id, source: r.fromId, target: r.toId, kind: "relation", label: r.label, confirmed: r.confirmed });
      }
    }
    return { nodeIds: ids.sort(), edges: es };
  }, [index, visible, hiddenCategories]);

  // レイアウト計算（前回位置を初期値にして、ノード追加時も配置が大きく動かないようにする）
  const [layout, setLayout] = useState<Layout>(new Map());
  useEffect(() => {
    const isPerson = (id: string) => index.person.has(id);
    const tagLabel = (id: string) => index.tag.get(id)?.label ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout((prev) => computeLayout(nodeIds, edges, prev, isPerson, tagLabel, compact));
  }, [nodeIds, edges, index, compact]);

  const fit = useCallback(() => {
    if (layout.size === 0) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    layout.forEach(({ x, y }) => {
      minX = Math.min(minX, x - 70);
      maxX = Math.max(maxX, x + 70);
      minY = Math.min(minY, y - 40);
      maxY = Math.max(maxY, y + 50);
    });
    const h = size.h - bottomInset;
    const k = Math.min(1.4, Math.max(0.3, Math.min(size.w / (maxX - minX), h / (maxY - minY)) * 0.92));
    setView({ k, x: size.w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k });
  }, [layout, size, bottomInset]);

  // ノード構成やサイズが変わったら全体表示
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fit();
  }, [fit]);

  const zoomBy = (factor: number, cx = size.w / 2, cy = size.h / 2) =>
    setView((v) => {
      const k = Math.min(3, Math.max(0.25, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });

  // ホイールズーム（passive: false で preventDefault するため直接登録）
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(3, Math.max(0.25, v.k * factor));
        const f = k / v.k;
        return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-node], button")) return;
    dragRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  // 選択ノードと直接つながるものだけを強調し、それ以外は薄くする
  const focus = useMemo(() => {
    if (!selectedId || !layout.has(selectedId)) return null;
    const s = new Set([selectedId]);
    edges.forEach((e) => {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    });
    return s;
  }, [selectedId, edges, layout]);

  const nodeOpacity = (id: string) => (!focus || focus.has(id) ? 1 : 0.22);
  const edgeActive = (e: Edge) => !!focus && (e.source === selectedId || e.target === selectedId);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg width={size.w} height={size.h} role="img" aria-label="人物とタグ・案件のつながり" className="block">
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map((e) => {
            const a = layout.get(e.source);
            const b = layout.get(e.target);
            if (!a || !b) return null;
            const active = edgeActive(e);
            const dim = focus && !active;
            const isRel = e.kind === "relation";
            const stroke = isRel ? (e.confirmed ? "#B5B8C1" : "#8A8E98") : active ? "#B5B8C1" : "#4A4F5A";
            const showLabel = isRel || active;
            // 選択ノードから放射状に出る線のラベルは、中心で重ならないよう相手側に寄せる
            const t = active ? (e.source === selectedId ? 0.62 : 0.38) : 0.5;
            const mx = a.x + (b.x - a.x) * t;
            const my = a.y + (b.y - a.y) * t;
            const label = isRel ? (e.confirmed ? e.label : `未確認・${e.label}`) : e.label;
            const lw = Math.min(label.length, 16) * 10.5 + 10;
            return (
              <g key={e.id} opacity={dim ? 0.15 : 1}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeWidth={isRel ? 1.6 : active ? 1.4 : 1}
                  strokeDasharray={isRel && !e.confirmed ? "5 5" : undefined}
                />
                {showLabel && label && (
                  <g transform={`translate(${mx},${my})`}>
                    <rect x={-lw / 2} y={-9} width={lw} height={18} rx={4} fill="#14161C" stroke={isRel && !e.confirmed ? "#8A8E98" : "none"} strokeDasharray="3 3" />
                    <text textAnchor="middle" dy={4} fontSize={10.5} fill={isRel && !e.confirmed ? "#B5B8C1" : "#F2F2F4"}>
                      {label.length > 16 ? `${label.slice(0, 15)}…` : label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {nodeIds.map((id) => {
            const p = layout.get(id);
            if (!p) return null;
            const selected = id === selectedId;
            const person = index.person.get(id);
            const common = {
              "data-node": true,
              role: "button",
              tabIndex: 0,
              opacity: nodeOpacity(id),
              style: { cursor: "pointer" },
              onClick: () => onSelect(id),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(id);
                }
              },
            };
            if (person) {
              return (
                <g key={id} transform={`translate(${p.x},${p.y})`} aria-label={`${person.name}（${person.deptTitle}）`} {...common}>
                  <circle r={26} fill="transparent" />
                  <circle r={PERSON_R} fill="#3A3F4B" stroke={selected ? "#FFFFFF" : "#4A4F5A"} strokeWidth={selected ? 2.5 : 1} />
                  <text textAnchor="middle" dy={6} fontSize={16} fill="#F2F2F4" fontWeight={500}>
                    {person.shortName}
                  </text>
                  <text textAnchor="middle" y={PERSON_R + 16} fontSize={12} fill="#F2F2F4" fontWeight={500}>
                    {person.name}
                  </text>
                  {!compact && (
                    <text textAnchor="middle" y={PERSON_R + 30} fontSize={10} fill="#B5B8C1">
                      {person.deptTitle.length > 14 ? `${person.deptTitle.slice(0, 13)}…` : person.deptTitle}
                    </text>
                  )}
                </g>
              );
            }
            const tag = index.tag.get(id)!;
            const c = CATEGORIES[tag.category];
            const w = tagWidth(tag.label);
            return (
              <g key={id} transform={`translate(${p.x},${p.y})`} aria-label={`${c.label}：${tag.label}`} {...common}>
                <rect x={-w / 2} y={-22} width={w} height={44} fill="transparent" />
                <rect x={-w / 2} y={-14} width={w} height={28} rx={14} fill={c.color} stroke={selected ? "#FFFFFF" : "none"} strokeWidth={2.5} />
                <text textAnchor="middle" dy={4.5} fontSize={12} fill={CATEGORY_TEXT} fontWeight={600}>
                  {tag.label}
                </text>
                <text textAnchor="middle" y={27} fontSize={9.5} fill="#B5B8C1">
                  {c.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {nodeIds.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-sub">表示できるノードがありません。絞り込みを解除してください。</p>
      )}

      <div className="absolute left-3 flex overflow-hidden rounded-lg border border-line bg-panel text-sm" style={{ bottom: 12 + bottomInset }}>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="縮小" className="h-11 w-11 hover:bg-card">
          −
        </button>
        <button type="button" onClick={fit} className="h-11 border-x border-line px-3 hover:bg-card">
          全体表示
        </button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="拡大" className="h-11 w-11 hover:bg-card">
          ＋
        </button>
      </div>
    </div>
  );
}

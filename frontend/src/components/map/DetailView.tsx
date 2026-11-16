"use client";

import { CATEGORIES, CATEGORY_TEXT } from "@/lib/categories";
import { formatDate, formatDateTime, formatYen, type GraphIndex } from "@/lib/graph";
import type { Person, Tag } from "@/lib/types";
import { Avatar, CategoryBadge, TagPill } from "../ui";

export interface DetailActions {
  onNavigate: (id: string) => void;
  onOpenMemo: (memoId: string) => void;
  onNewMemo: (personId: string) => void;
}

interface Props extends DetailActions {
  index: GraphIndex;
  id: string;
  filterActive: boolean;
}

export function DetailView({ index, id, filterActive, ...actions }: Props) {
  const person = index.person.get(id);
  if (person) return <PersonDetail index={index} person={person} filterActive={filterActive} {...actions} />;
  const tag = index.tag.get(id);
  if (tag?.category === "project") return <ProjectDetail index={index} tag={tag} {...actions} />;
  if (tag) return <TagDetail index={index} tag={tag} {...actions} />;
  return <p className="text-sm text-sub">選択した項目が見つかりません。</p>;
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {note && <p className="text-xs text-sub">{note}</p>}
      {children}
    </section>
  );
}

function PersonLink({ person, onNavigate, sub }: { person: Person; onNavigate: (id: string) => void; sub?: string }) {
  return (
    <button type="button" onClick={() => onNavigate(person.id)} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-card">
      <Avatar text={person.shortName} size={30} />
      <span className="min-w-0">
        <span className="block text-sm">{person.name}</span>
        <span className="block truncate text-xs text-sub">{sub ?? `${person.company}・${person.deptTitle}`}</span>
      </span>
    </button>
  );
}

// ---------------- A. 人物詳細 ----------------

function PersonDetail({ index, person, filterActive, onNavigate, onOpenMemo, onNewMemo }: { index: GraphIndex; person: Person; filterActive: boolean } & DetailActions) {
  const pts = index.tagsOfPerson.get(person.id) ?? [];
  const memos = index.memosOf.get(person.id) ?? [];
  const projects = pts.map((pt) => index.projectByTag.get(pt.tagId)).filter((p) => !!p);
  const relations = index.relationsOf.get(person.id) ?? [];

  // 共通タグでつながる人（面識は未確認として扱う）
  const commons: { other: Person; tag: Tag; reason: string }[] = [];
  for (const pt of pts) {
    const tag = index.tag.get(pt.tagId);
    if (!tag) continue;
    for (const o of index.personsOfTag.get(pt.tagId) ?? []) {
      const other = index.person.get(o.personId);
      if (other && other.id !== person.id) commons.push({ other, tag, reason: o.reason });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Avatar text={person.shortName} size={52} />
        <div className="min-w-0">
          <h2 className="text-lg font-medium">{person.name}</h2>
          <p className="text-sm text-sub">{person.company}</p>
          <p className="text-sm text-sub">{person.deptTitle}</p>
        </div>
      </div>
      {person.summary && <p className="text-sm leading-relaxed">{person.summary}</p>}

      <Section title="Salesforceの情報（サンプル）">
        {projects.length === 0 ? (
          <p className="text-sm text-sub">関連する商談は登録されていません。</p>
        ) : (
          projects.map((pr) => {
            const owner = pr.ownerId ? index.person.get(pr.ownerId) : null;
            return (
              <dl key={pr.id} className="grid grid-cols-[6.5em_1fr] gap-x-2 gap-y-1 rounded-lg bg-card p-3 text-sm">
                <dt className="text-sub">担当営業</dt>
                <dd>{owner?.name ?? "未登録"}</dd>
                <dt className="text-sub">関連商談</dt>
                <dd>{pr.name}</dd>
                <dt className="text-sub">商談金額</dt>
                <dd>{formatYen(pr.amount)}</dd>
                <dt className="text-sub">フェーズ</dt>
                <dd>{pr.stage}</dd>
                <dd className="col-span-2 pt-1">
                  <button type="button" onClick={() => onNavigate(pr.tagId)} className="btn-secondary min-h-9 w-full text-xs">
                    商談の詳細を見る
                  </button>
                </dd>
              </dl>
            );
          })
        )}
      </Section>

      <Section title="ヒアリングで得た人物理解" note={filterActive ? "※ マップではカテゴリー絞り込み中（非表示タグも以下に全表示）" : undefined}>
        <ul className="flex flex-col gap-2">
          {pts.map((pt) => {
            const tag = index.tag.get(pt.tagId);
            if (!tag) return null;
            return (
              <li key={pt.id}>
                <button type="button" onClick={() => onNavigate(tag.id)} className="flex w-full flex-col gap-1 rounded-lg bg-card p-3 text-left hover:brightness-110">
                  <span className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={pt.detailRole} />
                    <span className="text-sm font-medium">{pt.detailLabel ?? tag.label}</span>
                    {pt.detailLabel && <span className="text-xs text-sub">（{tag.label}）</span>}
                  </span>
                  <span className="text-xs text-sub">関わる理由：{pt.reason || "未登録"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="発言の引用・根拠メモ">
        {memos.length === 0 && <p className="text-sm text-sub">まだメモがありません。</p>}
        {memos.map((m) => (
          <figure key={m.id} className="rounded-lg border-l-2 border-sub bg-card p-3">
            <blockquote className="text-sm leading-relaxed">{m.quote || m.interpretation}</blockquote>
            <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
              <span>{formatDate(m.date)}</span>
              <span>登録者：{m.registrar}</span>
              <button type="button" onClick={() => onOpenMemo(m.id)} className="ml-auto text-accent underline-offset-2 hover:underline">
                根拠のメモを見る
              </button>
            </figcaption>
          </figure>
        ))}
        <button type="button" onClick={() => onNewMemo(person.id)} className="btn-ghost self-start text-xs">
          ＋ この人のメモを追加
        </button>
      </Section>

      {relations.length > 0 && (
        <Section title="直接の関係（登録済み）">
          {relations.map((r) => {
            const other = index.person.get(r.fromId === person.id ? r.toId : r.fromId);
            if (!other) return null;
            return (
              <div key={r.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PersonLink person={other} onNavigate={onNavigate} />
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${r.confirmed ? "bg-card text-fg" : "border border-dashed border-sub text-sub"}`}>
                  {r.confirmed ? r.label : `未確認・${r.label}`}
                </span>
              </div>
            );
          })}
        </Section>
      )}

      <Section title="共通テーマでつながる人" note="※ 共通点による候補・実際の面識は未確認">
        {commons.length === 0 && <p className="text-sm text-sub">共通のタグを持つ人はまだいません。</p>}
        <ul className="flex flex-col gap-1">
          {commons.map(({ other, tag, reason }) => (
            <li key={`${other.id}-${tag.id}`} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PersonLink person={other} onNavigate={onNavigate} sub={`${tag.label}：${reason}`} />
              </div>
              <CategoryBadge category={tag.category} size="xs" />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ---------------- B. タグ詳細 ----------------

function TagDetail({ index, tag, onNavigate, onOpenMemo }: { index: GraphIndex; tag: Tag } & DetailActions) {
  const pts = index.personsOfTag.get(tag.id) ?? [];
  const isHobby = tag.category === "hobby";
  const relatedProjects = index.data.projects.filter((p) => p.relatedTagIds.includes(tag.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <CategoryBadge category={tag.category} />
        <h2 className="text-lg font-medium">{tag.label}</h2>
        <p className="text-sm text-sub">{pts.length}名がこのテーマに関わっています。</p>
        {isHobby && <p className="rounded-lg border border-dashed border-sub px-3 py-2 text-sm text-sub">共通の関心・趣味。実際の面識は未確認。</p>}
      </div>

      <MiniGraph index={index} tag={tag} onNavigate={onNavigate} />

      {isHobby ? (
        <Section title="会話から見つかった接点">
          {pts.map((pt) => {
            const p = index.person.get(pt.personId);
            if (!p) return null;
            const memo = (index.memosOf.get(p.id) ?? []).find((m) => m.tagIds.includes(tag.id));
            return (
              <div key={pt.id} className="flex flex-col gap-1.5 rounded-lg bg-card p-3">
                <PersonLink person={p} onNavigate={onNavigate} sub={pt.reason} />
                {memo ? (
                  <>
                    <blockquote className="border-l-2 border-sub pl-2 text-sm leading-relaxed">{memo.quote}</blockquote>
                    <p className="flex flex-wrap gap-x-3 text-xs text-sub">
                      <span>出典：{formatDate(memo.date)}・{memo.context}</span>
                      <button type="button" onClick={() => onOpenMemo(memo.id)} className="text-accent hover:underline">
                        根拠のメモを見る
                      </button>
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-sub">出典メモは未登録</p>
                )}
              </div>
            );
          })}
        </Section>
      ) : (
        <Section title="関心の背景" note="同じテーマでも、人によって関わる理由が違います。">
          {pts.map((pt) => {
            const p = index.person.get(pt.personId);
            if (!p) return null;
            return (
              <div key={pt.id} className="flex flex-col gap-1.5 rounded-lg bg-card p-3">
                <PersonLink person={p} onNavigate={onNavigate} />
                <span className="flex flex-wrap items-center gap-2 pl-1">
                  <CategoryBadge category={pt.detailRole} />
                  <span className="text-sm">{pt.detailLabel ?? tag.label}</span>
                </span>
                <span className="pl-1 text-xs text-sub">理由：{pt.reason || "未登録"}</span>
              </div>
            );
          })}
        </Section>
      )}

      {relatedProjects.length > 0 && (
        <Section title="関連案件">
          <div className="flex flex-wrap gap-2">
            {relatedProjects.map((p) => (
              <TagPill key={p.id} category="project" label={p.name} onClick={() => onNavigate(p.tagId)} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/** タグを中心に関係人物を円形に並べた接点図 */
function MiniGraph({ index, tag, onNavigate }: { index: GraphIndex; tag: Tag; onNavigate: (id: string) => void }) {
  const pts = (index.personsOfTag.get(tag.id) ?? []).slice(0, 8);
  const W = 340,
    H = 240,
    cx = W / 2,
    cy = H / 2 - 6,
    R = 80;
  const c = CATEGORIES[tag.category];
  const dashed = tag.category === "hobby";
  const tw = Math.max(60, tag.label.length * 12 + 22);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-canvas" role="img" aria-label={`${tag.label}の接点図`}>
      {pts.map((pt, i) => {
        const a = (i / pts.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * R * 1.55;
        const y = cy + Math.sin(a) * R;
        const p = index.person.get(pt.personId);
        if (!p) return null;
        return (
          <g key={pt.id}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#4A4F5A" strokeDasharray={dashed ? "4 4" : undefined} />
            <g
              transform={`translate(${x},${y})`}
              role="button"
              tabIndex={0}
              aria-label={p.name}
              className="cursor-pointer"
              onClick={() => onNavigate(p.id)}
              onKeyDown={(e) => e.key === "Enter" && onNavigate(p.id)}
            >
              <circle r={22} fill="transparent" />
              <circle r={15} fill="#3A3F4B" />
              <text textAnchor="middle" dy={5} fontSize={13} fill="#F2F2F4">
                {p.shortName}
              </text>
              <text textAnchor="middle" y={30} fontSize={10.5} fill="#B5B8C1">
                {p.name}
              </text>
            </g>
          </g>
        );
      })}
      <rect x={cx - tw / 2} y={cy - 13} width={tw} height={26} rx={13} fill={c.color} />
      <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize={12} fontWeight={600} fill={CATEGORY_TEXT}>
        {tag.label}
      </text>
    </svg>
  );
}

// ---------------- C. 案件詳細 ----------------

function ProjectDetail({ index, tag, onNavigate }: { index: GraphIndex; tag: Tag } & DetailActions) {
  const pr = index.projectByTag.get(tag.id);
  const pts = index.personsOfTag.get(tag.id) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category="project" />
          {pr && <span className="text-xs text-sub">Salesforce由来・サンプル</span>}
        </div>
        <h2 className="text-lg font-medium">{tag.label}</h2>
        {pr && <p className="text-xs text-sub">最終同期：{formatDateTime(pr.lastSync)}</p>}
      </div>

      {pr ? (
        <Section title="商談情報">
          <table className="w-full text-sm">
            <tbody className="[&_td]:py-1.5 [&_th]:py-1.5 [&_th]:pr-3 [&_th]:text-left [&_th]:font-normal [&_th]:text-sub [&_tr]:border-b [&_tr]:border-line">
              <tr>
                <th scope="row">取引先</th>
                <td>{pr.accountName}</td>
              </tr>
              <tr>
                <th scope="row">商談金額</th>
                <td>{formatYen(pr.amount)}</td>
              </tr>
              <tr>
                <th scope="row">フェーズ</th>
                <td>{pr.stage}</td>
              </tr>
              <tr>
                <th scope="row">受注予定日</th>
                <td>{formatDate(pr.closeDate)}</td>
              </tr>
              <tr>
                <th scope="row">商談所有者</th>
                <td>{pr.ownerId ? (index.person.get(pr.ownerId)?.name ?? "未登録") : "未登録"}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      ) : (
        <p className="text-sm text-sub">この案件の商談情報は Salesforce と未連携です。</p>
      )}

      <Section title="関係人物と役割" note="登録済みの役割のみ表示しています（役職からの推測はしません）。">
        {pts.map((pt) => {
          const p = index.person.get(pt.personId);
          if (!p) return null;
          const role = pr?.roles.find((r) => r.personId === p.id)?.role;
          return (
            <div key={pt.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PersonLink person={p} onNavigate={onNavigate} />
              </div>
              <span className={`shrink-0 text-xs ${role ? "text-fg" : "text-sub"}`}>{role ?? "役割未登録"}</span>
            </div>
          );
        })}
      </Section>

      {pr && pr.relatedTagIds.length > 0 && (
        <Section title="関連する関心ごと">
          <div className="flex flex-wrap gap-2">
            {pr.relatedTagIds.map((tid) => {
              const t = index.tag.get(tid);
              return t ? <TagPill key={tid} category={t.category} label={t.label} onClick={() => onNavigate(tid)} /> : null;
            })}
          </div>
        </Section>
      )}

      <div className="flex flex-col gap-1.5 border-t border-line pt-4">
        <button type="button" disabled={!pr?.sfUrl} onClick={() => pr?.sfUrl && window.open(pr.sfUrl, "_blank", "noopener")} className="btn-secondary">
          Salesforceで開く
        </button>
        {!pr?.sfUrl && <p className="text-xs text-sub">実際の Salesforce URL が未設定のため開けません（架空のリンクは開きません）。</p>}
      </div>
    </div>
  );
}

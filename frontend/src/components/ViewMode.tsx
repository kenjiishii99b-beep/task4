"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";

// PC 版 / スマホ版の切替。auto のときは画面幅 900px 未満でスマホ版。
type Mode = "auto" | "pc" | "mobile";

interface ViewModeValue {
  mode: Mode;
  isMobile: boolean;
  /** 画面自体は広いが、スマホ版をプレビュー表示している */
  isPreview: boolean;
  setMode: (m: Mode) => void;
}

const Ctx = createContext<ViewModeValue>({ mode: "auto", isMobile: false, isPreview: false, setMode: () => {} });

const QUERY = "(max-width: 899px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function readStored(): Mode {
  try {
    const v = window.localStorage.getItem("viewMode");
    return v === "pc" || v === "mobile" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const narrow = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  const [mode, setModeState] = useState<Mode>("auto");

  useEffect(() => {
    // localStorage はブラウザでのみ読めるため、マウント後に反映する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStored());
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      window.localStorage.setItem("viewMode", m);
    } catch {
      /* 保存できなくても表示は切り替える */
    }
  }, []);

  // 実機が狭い画面なら常にスマホ版（PC 版を選んでも崩れるだけなので）
  const isMobile = narrow || mode === "mobile";
  const isPreview = !narrow && mode === "mobile";
  return <Ctx.Provider value={{ mode, isMobile, isPreview, setMode }}>{children}</Ctx.Provider>;
}

export const useViewMode = () => useContext(Ctx);

/** スマホ版プレビュー時は 390×844 の枠に収め、それ以外は全画面 */
export function DeviceFrame({ children }: { children: React.ReactNode }) {
  const { isPreview, setMode } = useViewMode();
  if (!isPreview) {
    return <div className="relative h-dvh w-full overflow-hidden">{children}</div>;
  }
  return (
    <div className="flex h-dvh w-full flex-col items-center gap-3 overflow-auto py-4">
      <div className="flex items-center gap-3 text-sm text-sub">
        <span>スマホ版プレビュー（390×844）</span>
        <button type="button" onClick={() => setMode("pc")} className="btn-ghost">
          PC版に戻す
        </button>
      </div>
      <div className="relative h-[844px] max-h-[calc(100dvh-80px)] w-[390px] shrink-0 overflow-hidden rounded-[28px] border border-line bg-canvas">
        {children}
      </div>
    </div>
  );
}

export function ViewToggle() {
  const { mode, isMobile, setMode } = useViewMode();
  const current = mode === "auto" ? (isMobile ? "mobile" : "pc") : mode;
  return (
    <div role="group" aria-label="表示の切替" className="inline-flex rounded-full border border-line p-0.5 text-xs">
      {(["pc", "mobile"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={current === m}
          onClick={() => setMode(m)}
          className={`rounded-full px-3 py-1.5 ${current === m ? "bg-card text-fg" : "text-sub hover:text-fg"}`}
        >
          {m === "pc" ? "PC版" : "スマホ版"}
        </button>
      ))}
    </div>
  );
}

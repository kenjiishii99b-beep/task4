"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { SearchBox } from "@/components/map/SearchBox";
import { ErrorBanner, MapIcon, MicIcon } from "@/components/ui";
import { ViewToggle } from "@/components/ViewMode";
import { api } from "@/lib/api";
import { buildIndex, type GraphIndex } from "@/lib/graph";
import { getRecognitionCtor, useSpeechRecognition } from "@/lib/useSpeech";

// クイック探索チップ：検索文字列ではなく初期選択ノードを渡す
const QUICK_CHIPS = [
  { label: "東都設備・田中部長", select: "p-tanaka" },
  { label: "省エネの接点を見る", select: "t-energy" },
  { label: "ポンプ入替工事", select: "o-pump" },
];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [micError, setMicError] = useState<string | null>(null);

  const voiceSearch = useSpeechRecognition({ continuous: false });
  const searchText = voiceSearch.listening ? voiceSearch.finalText + voiceSearch.interim : query;

  // 検索候補のためのデータ。検索欄を使い始めたときに 1 回だけ読み込む
  const [index, setIndex] = useState<GraphIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const loadIndex = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadError(null);
    api
      .graph()
      .then((g) => setIndex(buildIndex(g)))
      .catch((e: Error) => {
        loadingRef.current = false; // 次に検索欄を使ったときに再試行する
        setLoadError(`候補を表示できません：${e.message}`);
      });
  }, []);
  const [voiceSignal, setVoiceSignal] = useState(0);

  // マイク権限を確認してから録音画面へ（録音画面で認識を開始する）
  const startRecording = async () => {
    setMicError(null);
    if (!getRecognitionCtor()) {
      router.push("/record/?manual=1");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      router.push("/record/");
    } catch {
      setMicError("マイクの使用が許可されていません。ブラウザのアドレスバー左のアイコンからマイクを許可するか、文字で入力してください。");
    }
  };

  const toggleVoiceSearch = () => {
    loadIndex();
    if (voiceSearch.listening) {
      const text = voiceSearch.stop();
      setQuery(text);
      setVoiceSignal((n) => n + 1);
      return;
    }
    voiceSearch.start();
  };

  // 音声検索の認識結果を、認識が終わった時点で 1 回だけ入力欄へ反映し、候補を開く
  const [appliedVoice, setAppliedVoice] = useState("");
  if (!voiceSearch.listening && voiceSearch.finalText && voiceSearch.finalText !== appliedVoice) {
    setAppliedVoice(voiceSearch.finalText);
    setQuery(voiceSearch.finalText);
    setVoiceSignal((n) => n + 1);
  }

  return (
    <main className="flex h-full flex-col overflow-y-auto">
      <div className="flex justify-end px-4 pt-4">
        <ViewToggle />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6">
        {/* 記録（インプット） */}
        <section aria-labelledby="record-heading" className="flex flex-1 flex-col items-center justify-center gap-8 py-10 text-center">
          <h1 id="record-heading" className="text-xl leading-relaxed font-medium">
            お疲れ様です。
            <br />
            お仕事の記録を残して
            <br />
            みんなの共通知を作りましょう
          </h1>
          <button
            type="button"
            onClick={startRecording}
            aria-label="音声で記録をはじめる"
            className="flex h-20 w-20 items-center justify-center rounded-full bg-mic text-white transition-transform hover:scale-105 active:scale-95"
          >
            <MicIcon className="h-9 w-9" />
          </button>
          <div className="flex flex-col items-center gap-2">
            {micError && <ErrorBanner>{micError}</ErrorBanner>}
            <button type="button" onClick={() => router.push("/record/?manual=1")} className="btn-ghost text-xs">
              声を出せないときは文字で記録する
            </button>
          </div>
        </section>

        <hr className="border-line" />

        {/* 知識検索（アウトプット） */}
        <section aria-labelledby="search-heading" className="flex flex-col gap-4 py-10">
          <h2 id="search-heading" className="text-lg leading-relaxed font-medium">
            何かお探しですか？
            <br />
            仲間の知識も借りましょう。
          </h2>
          <div role="search">
            <SearchBox
              index={index}
              value={searchText}
              onChange={(v) => {
                setQuery(v);
                loadIndex();
              }}
              onFocus={loadIndex}
              onPick={(h) => router.push(`/map/?select=${encodeURIComponent(h.id)}`)}
              unavailableMessage={loadError}
              openSignal={voiceSignal}
              placeholder="○○社のキーマンは？"
              size="lg"
              trailing={
                <button
                  type="button"
                  onClick={toggleVoiceSearch}
                  aria-label={voiceSearch.listening ? "音声入力を止める" : "音声で検索する"}
                  aria-pressed={voiceSearch.listening}
                  className={`flex h-10 w-10 items-center justify-center rounded-md ${voiceSearch.listening ? "bg-rec text-white" : "text-sub hover:text-fg"}`}
                >
                  <MicIcon className="h-5 w-5" />
                </button>
              }
            />
          </div>
          {voiceSearch.error && (
            <p className="text-xs text-sub">
              {voiceSearch.error === "unsupported" ? "このブラウザは音声入力に対応していません（Google Chrome をお使いください）。" : "音声入力を開始できませんでした。マイクの許可を確認してください。"}
            </p>
          )}
          <div className="flex flex-wrap gap-2" aria-label="よく見る探し方">
            {/* Link（a 要素）にしておくと、JS の読み込み完了前に押されても遷移できる */}
            {QUICK_CHIPS.map((c) => (
              <Link
                key={c.select}
                href={`/map/?select=${c.select}`}
                className="inline-flex min-h-10 items-center rounded-full border border-line bg-card px-3.5 text-sm text-fg hover:border-sub"
              >
                {c.label}
              </Link>
            ))}
          </div>
          <Link
            href="/map/"
            className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-5 text-sm font-medium text-fg transition-colors hover:border-accent hover:bg-accent/20"
          >
            <MapIcon className="h-5 w-5 text-accent" />
            人物マップをひらく
          </Link>
        </section>
      </div>
    </main>
  );
}

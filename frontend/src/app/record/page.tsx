"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBanner, MicIcon, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { flow } from "@/lib/flow";
import { getRecognitionCtor, useSpeechRecognition } from "@/lib/useSpeech";

const MAX_SECONDS = 30;
const fmt = (s: number) => `00:${String(s).padStart(2, "0")}`;

export default function RecordPage() {
  const router = useRouter();
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [emptyNotice, setEmptyNotice] = useState(false);
  const startedRef = useRef(false);

  const submit = useCallback(
    async (text: string) => {
      const transcript = text.trim();
      if (!transcript) {
        setEmptyNotice(true);
        return;
      }
      setSending(true);
      setSendError(null);
      try {
        const { summary, mode } = await api.summarize(transcript);
        flow.setDraft({ transcript, summary, mode });
        router.push("/confirm/");
      } catch (e) {
        setSendError((e as Error).message);
        setSending(false);
      }
    },
    [router],
  );

  const speech = useSpeechRecognition({ continuous: true, maxSeconds: MAX_SECONDS, onAutoStop: submit });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const wantsManual = new URLSearchParams(window.location.search).get("manual") === "1";
    if (wantsManual || !getRecognitionCtor()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManual(true);
      return;
    }
    speech.start();
  }, [speech]);

  const fallback = speech.error === "unsupported" || speech.error === "not-allowed";
  const showManual = manual || fallback;

  const onStop = () => submit(speech.stop());
  const onCancel = () => {
    speech.abort();
    router.push("/");
  };

  return (
    <main className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center px-3 pt-3">
        <button type="button" onClick={onCancel} className="btn-ghost">
          ← キャンセル
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-4 pb-8">
        <h1 className="text-center text-lg leading-relaxed font-medium">
          お疲れ様です。
          <br />
          お仕事の記録を残して
          <br />
          みんなの共通知を作りましょう
        </h1>

        <div className="rounded-xl border border-line bg-panel px-5 py-4 text-sm leading-7 text-sub">
          誰とお会いしましたか？
          <br />
          どんな方でしたか？
          <br />
          関心ごとや困りごと、
          <br />
          趣味とかでもいいです。
          <br />
          キーマンが分かると仲間も
          <br />
          スムーズに仕事が進みますね
        </div>

        {fallback && (
          <ErrorBanner>
            {speech.error === "unsupported"
              ? "このブラウザは音声認識に対応していません。Google Chrome を使うか、下の欄に文字で入力してください。"
              : "マイクの使用が許可されていません。ブラウザの設定でマイクを許可するか、下の欄に文字で入力してください。"}
          </ErrorBanner>
        )}
        {speech.error === "network" && <ErrorBanner>音声認識サービスに接続できませんでした。通信状況を確認してください。</ErrorBanner>}
        {sendError && <ErrorBanner>要約に失敗しました：{sendError}</ErrorBanner>}
        {emptyNotice && !sending && <ErrorBanner>文字起こしが空です。もう一度話すか、文字で入力してください。</ErrorBanner>}

        {showManual ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(manualText);
            }}
          >
            <label htmlFor="manual" className="section-title">
              記録の内容
            </label>
            <textarea
              id="manual"
              rows={7}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="例：東都設備の田中部長と面談。電気代が予算を圧迫していて省エネに関心。週末は海釣りに行くそうです。"
              className="field leading-relaxed"
            />
            <button type="submit" disabled={sending || !manualText.trim()} className="btn-primary">
              要約する
            </button>
            {!fallback && getRecognitionCtor() && (
              <button
                type="button"
                className="btn-ghost self-center"
                onClick={() => {
                  setManual(false);
                  speech.start();
                }}
              >
                音声で記録する
              </button>
            )}
          </form>
        ) : (
          <>
            {/* リアルタイム文字起こし：確定は白、認識途中は補助色 */}
            <div aria-live="polite" className="min-h-28 rounded-xl border border-line bg-card px-4 py-3 text-[15px] leading-7">
              {speech.finalText || speech.interim ? (
                <>
                  <span className="text-fg">{speech.finalText}</span>
                  <span className="text-sub">{speech.interim}</span>
                </>
              ) : (
                <span className="text-sub/70">{speech.listening ? "お話しください…" : "録音を開始していません"}</span>
              )}
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="flex h-10 items-center gap-1" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-full w-1.5 rounded-full bg-sub ${speech.listening ? "wave-bar" : "scale-y-[0.2]"}`}
                    style={{ animationDelay: `${(i % 5) * 0.12 + (i > 4 ? 0.06 : 0)}s` }}
                  />
                ))}
              </div>
              <p className="text-sm text-sub tabular-nums">
                {speech.listening ? "録音中" : "停止中"} {fmt(speech.elapsed)} / {fmt(MAX_SECONDS)}
              </p>

              {sending ? (
                <Spinner label="AI で要約しています…" />
              ) : speech.listening ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="録音を停止して要約する"
                  className="flex h-18 w-18 items-center justify-center rounded-full bg-rec"
                >
                  <span className="h-6 w-6 rounded-sm bg-white" />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button type="button" onClick={() => speech.start()} aria-label="録音を開始する" className="flex h-18 w-18 items-center justify-center rounded-full bg-mic text-white">
                    <MicIcon className="h-8 w-8" />
                  </button>
                  {speech.finalText && (
                    <button type="button" onClick={() => submit(speech.finalText)} className="btn-secondary">
                      この内容で要約する
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  speech.abort();
                  setManualText(speech.finalText);
                  setManual(true);
                }}
                className="btn-ghost text-xs"
              >
                文字で入力する
              </button>
            </div>
          </>
        )}
        {sending && showManual && <Spinner label="AI で要約しています…" />}
      </div>
    </main>
  );
}

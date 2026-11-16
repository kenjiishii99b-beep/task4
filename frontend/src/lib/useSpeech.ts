"use client";

// Chrome の Web Speech API（SpeechRecognition / webkitSpeechRecognition）のラッパー。
// HTTPS または localhost でのみ動作する。

import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

export function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type SpeechError = "unsupported" | "not-allowed" | "network" | "other" | null;

interface Options {
  continuous: boolean;
  /** 自動停止までの秒数（continuous のとき） */
  maxSeconds?: number;
  onAutoStop?: (finalText: string) => void;
}

export function useSpeechRecognition({ continuous, maxSeconds = 30, onAutoStop }: Options) {
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechError>(null);
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const userStoppedRef = useRef(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAutoStopRef = useRef(onAutoStop);
  useEffect(() => {
    onAutoStopRef.current = onAutoStop;
  }, [onAutoStop]);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(() => {
    userStoppedRef.current = true;
    clearTimer();
    setListening(false);
    setInterim("");
    try {
      recRef.current?.stop();
    } catch {
      /* 既に停止済み */
    }
    return finalRef.current;
  }, []);

  const abort = useCallback(() => {
    userStoppedRef.current = true;
    clearTimer();
    setListening(false);
    try {
      recRef.current?.abort();
    } catch {
      /* noop */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("unsupported");
      return;
    }
    setError(null);
    finalRef.current = "";
    setFinalText("");
    setInterim("");
    setElapsed(0);
    userStoppedRef.current = false;
    startedAtRef.current = Date.now();

    const rec: Recognition = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = continuous;
    rec.interimResults = true;

    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setFinalText(finalRef.current);
      setInterim(interimText);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        userStoppedRef.current = true;
        setError("not-allowed");
      } else if (e.error === "network") {
        setError("network");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("other");
      }
    };
    rec.onend = () => {
      const within = (Date.now() - startedAtRef.current) / 1000 < maxSeconds;
      // 無音タイムアウトで意図せず止まった場合は、30 秒未満かつユーザー停止前なら再接続する
      if (continuous && !userStoppedRef.current && within) {
        try {
          rec.start();
          return;
        } catch {
          /* 再開できなければ停止扱い */
        }
      }
      clearTimer();
      setListening(false);
      setInterim("");
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("other");
      return;
    }

    if (continuous) {
      clearTimer();
      timerRef.current = setInterval(() => {
        const sec = Math.min(maxSeconds, Math.floor((Date.now() - startedAtRef.current) / 1000));
        setElapsed(sec);
        if (sec >= maxSeconds) {
          const text = stop();
          onAutoStopRef.current?.(text);
        }
      }, 250);
    }
  }, [continuous, maxSeconds, stop]);

  useEffect(() => () => {
    clearTimer();
    try {
      recRef.current?.abort();
    } catch {
      /* noop */
    }
  }, []);

  return { finalText, interim, listening, error, elapsed, start, stop, abort };
}

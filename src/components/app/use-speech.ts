"use client";
// Voice search with the browser's Web Speech API. Arabic first («ar-SA», then «ar»). The button
// shows only where the API exists; the microphone is asked for only on tap.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

export type SpeechState = "idle" | "listening" | "denied" | "failed";

export function useSpeech(onText: (text: string, final: boolean) => void) {
  const supported = useSyncExternalStore(
    noop,
    () => !!ctor(),
    () => false,
  );
  const [state, setState] = useState<SpeechState>("idle");
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });
  useEffect(() => () => rec.current?.abort(), []);

  const run = useCallback(function listen(lang: string) {
    const C = ctor();
    if (!C) return;
    const r = new C();
    rec.current = r;
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let heard = false;
    r.onresult = (e) => {
      heard = true;
      const parts = Array.from(e.results);
      const text = parts.map((x) => x[0]?.transcript ?? "").join(" ");
      const last = parts[parts.length - 1] as unknown as { isFinal?: boolean };
      cb.current(text, !!last?.isFinal);
    };
    r.onerror = (e) => {
      if (e.error === "language-not-supported" && lang !== "ar") return listen("ar");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setState("denied");
      else if (e.error !== "aborted" && e.error !== "no-speech") setState("failed");
      else setState("idle");
    };
    r.onend = () => {
      if (rec.current === r) {
        rec.current = null;
        setState((s) => (s === "listening" ? (heard ? "idle" : "failed") : s));
      }
    };
    try {
      r.start();
      setState("listening");
    } catch {
      setState("failed");
    }
  }, []);

  const start = useCallback(() => {
    rec.current?.abort();
    run("ar-SA");
  }, [run]);
  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, state, start, stop, reset: () => setState("idle") };
}

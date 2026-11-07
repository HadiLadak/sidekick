"use client";

const SPEECH_TAGS: Record<string, string> = {
  en: "en-CA", fr: "fr-CA", es: "es-ES", ur: "ur-PK", ar: "ar-SA", hi: "hi-IN", pa: "pa-IN",
  zh: "zh-CN", fa: "fa-IR", tl: "fil-PH", pt: "pt-BR", de: "de-DE", it: "it-IT", ko: "ko-KR",
  ja: "ja-JP", vi: "vi-VN", ru: "ru-RU", tr: "tr-TR", bn: "bn-IN", ta: "ta-IN", gu: "gu-IN",
};

export const speechTag = (code: string) =>
  code.includes("-") ? code : SPEECH_TAGS[code.toLowerCase()] ?? code;

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

function pickVoice(tag: string) {
  const voices = window.speechSynthesis.getVoices();
  const base = tag.split("-")[0].toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === tag.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    // Urdu voices are rare; Hindi is mutually intelligible when spoken
    (base === "ur" ? voices.find((v) => v.lang.toLowerCase().startsWith("hi")) : undefined)
  );
}

export function speak(text: string, lang: string, onEnd?: () => void) {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const tag = speechTag(lang);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag;
  const voice = pickVoice(tag);
  if (voice) u.voice = voice;
  u.rate = 0.92;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

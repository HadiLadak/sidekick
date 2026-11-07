"use client";

import { useCallback, useEffect, useState } from "react";
import { LANGS, STRINGS, type Lang } from "./i18n";

export interface Prefs {
  lang: Lang;
  simple: boolean;
  theme: "light" | "dark" | null;
}

const KEY = "sid:prefs";
// Simple mode is the default: big type, fewer choices. People can switch it off for more detail.
const DEFAULT: Prefs = { lang: "en", simple: true, theme: null };

function read(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const lang = LANGS.some((l) => l.code === raw.lang) ? raw.lang : guessLang();
    return { lang, simple: raw.simple !== false, theme: raw.theme === "dark" || raw.theme === "light" ? raw.theme : null };
  } catch {
    return DEFAULT;
  }
}

function guessLang(): Lang {
  const nav = (typeof navigator !== "undefined" && navigator.language?.slice(0, 2)) || "en";
  return (LANGS.find((l) => l.code === nav)?.code ?? "en") as Lang;
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);
  const isDark = prefs.theme ? prefs.theme === "dark" : systemDark;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setPrefs(read());
    setReady(true);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!ready) return; // the inline boot script already applied saved prefs before paint
    const d = document.documentElement;
    const meta = LANGS.find((l) => l.code === prefs.lang)!;
    d.lang = prefs.lang;
    d.dir = meta.dir;
    d.dataset.simple = String(prefs.simple);
    d.classList.toggle("dark", isDark);
  }, [prefs, isDark, ready]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { prefs, update, isDark, t: STRINGS[prefs.lang], langMeta: LANGS.find((l) => l.code === prefs.lang)! };
}

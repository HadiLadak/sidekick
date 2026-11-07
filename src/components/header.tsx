"use client";

import { Globe, Moon, Sun } from "lucide-react";
import { LANGS, type Lang, type Strings } from "@/lib/i18n";
import type { Prefs } from "@/lib/prefs";
import { Sid } from "./sid";

export function Header({
  prefs,
  update,
  isDark,
  t,
  onHome,
}: {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  isDark: boolean;
  t: Strings;
  onHome: () => void;
}) {
  return (
    <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-1.5 px-3 pt-4 pb-2 sm:px-6">
      <button
        type="button"
        onClick={onHome}
        className="flex items-center gap-2 rounded-full pe-2 font-hand text-2xl font-bold text-ink"
        aria-label="Sid, home"
      >
        <Sid className="size-10" animate={false} />
        <span aria-hidden="true" className="hidden min-[440px]:inline">Sid</span>
      </button>

      <div className="ms-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        <label className="relative flex h-11 items-center rounded-full bg-surface ps-2.5 pe-1 ring-1 ring-line focus-within:ring-2 focus-within:ring-sky">
          <Globe className="size-4 shrink-0 text-ink-soft" aria-hidden="true" />
          <span className="sr-only">{t.language}</span>
          <select
            value={prefs.lang}
            onChange={(e) => update({ lang: e.target.value as Lang })}
            className="h-full max-w-[5.5rem] appearance-none bg-transparent ps-2 pe-1 text-sm font-semibold text-ink outline-none"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={prefs.simple}
          onClick={() => update({ simple: !prefs.simple })}
          className="flex h-11 items-center gap-2 rounded-full bg-surface ps-3 pe-1.5 text-sm leading-tight font-semibold text-ink ring-1 ring-line transition-colors aria-checked:bg-ink aria-checked:text-paper aria-checked:ring-ink"
        >
          <span className="whitespace-nowrap">{t.simple}</span>
          <span
            aria-hidden="true"
            className="relative h-7 w-12 rounded-full bg-surface-2 transition-colors in-aria-checked:bg-mark"
          >
            <span className="absolute top-1 start-1 size-5 rounded-full bg-ink-soft transition-transform duration-200 in-aria-checked:translate-x-5 in-aria-checked:bg-ink rtl:in-aria-checked:-translate-x-5" />
          </span>
        </button>

        <button
          type="button"
          aria-pressed={isDark}
          aria-label={t.theme}
          onClick={() => update({ theme: isDark ? "light" : "dark" })}
          className="grid size-11 place-items-center rounded-full bg-surface text-ink ring-1 ring-line"
        >
          {isDark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

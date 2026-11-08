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
  wide = false,
  split = false,
}: {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  isDark: boolean;
  t: Strings;
  onHome: () => void;
  wide?: boolean;
  /** Two-column home: narrow on phones, wide from lg up */
  split?: boolean;
}) {
  return (
    <header className={`site-header mx-auto flex w-full ${wide ? "max-w-6xl" : split ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl"} flex-wrap items-center gap-1.5 px-3 pt-4 pb-2 sm:px-6`}>
      <button
        type="button"
        onClick={onHome}
        className="flex h-11 items-center gap-2 rounded-full pe-2 font-hand text-2xl leading-none font-bold text-ink"
        aria-label="Sid, home"
      >
        <Sid className="size-11" animate={false} />
        <span aria-hidden="true" translate="no" className="hidden min-[440px]:inline">Sid</span>
      </button>

      {/* One joined control strip: same height, same edge, dividers between */}
      <div className="ms-auto flex h-11 items-stretch divide-x divide-line overflow-hidden rounded-full bg-surface text-sm font-semibold text-ink ring-1 ring-line rtl:divide-x-reverse">
        <label className="relative flex items-center gap-1.5 ps-3.5 pe-1 focus-within:bg-sky-bg">
          <Globe className="size-4 shrink-0 text-ink-soft" aria-hidden="true" />
          <span className="sr-only">{t.language}</span>
          <select
            value={prefs.lang}
            onChange={(e) => update({ lang: e.target.value as Lang })}
            className="h-full max-w-[5.5rem] appearance-none bg-transparent pe-2 outline-none"
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
          className="flex items-center gap-2 px-3 leading-tight outline-offset-[-3px] hover:bg-surface-2"
        >
          <span className="whitespace-nowrap">{t.simple}</span>
          <span aria-hidden="true" className="relative h-6 w-10 rounded-full bg-surface-2 ring-1 ring-line transition-colors in-aria-checked:bg-ink in-aria-checked:ring-ink">
            <span className="absolute top-1 start-1 size-4 rounded-full bg-ink-soft transition-transform duration-200 in-aria-checked:translate-x-4 in-aria-checked:bg-paper rtl:in-aria-checked:-translate-x-4" />
          </span>
        </button>

        <button
          type="button"
          aria-pressed={isDark}
          aria-label={t.theme}
          onClick={() => update({ theme: isDark ? "light" : "dark" })}
          className="grid w-11 place-items-center outline-offset-[-3px] hover:bg-surface-2"
        >
          {isDark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

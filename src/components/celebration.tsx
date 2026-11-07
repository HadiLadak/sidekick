"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Strings } from "@/lib/i18n";
import { Sid } from "./sid";

const COLORS = ["var(--mark)", "#ff8f7a", "#7cc4ff", "#7fe0b0", "#cfb2ff", "#1b2452"];

/**
 * Shown only after the user taps "It's fixed" (or "Got it" on a scam check). Escape or Close just
 * closes it and keeps the answer on screen; "Ask something new" starts over.
 */
export function Celebration({
  t,
  onClose,
  onStartOver,
  summary,
  safe = false,
}: {
  t: Strings;
  onClose: () => void;
  onStartOver: () => void;
  summary?: string;
  safe?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 11) * 0.09,
        dur: 2.2 + ((i * 7) % 10) / 10,
        drift: `${((i * 13) % 30) - 15}vw`,
        spin: `${360 + ((i * 47) % 540)}deg`,
        color: COLORS[i % COLORS.length],
        w: 8 + (i % 3) * 4,
        round: i % 4 === 0,
      })),
    [],
  );

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="celebrate-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] overflow-visible bg-transparent p-0 backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="absolute top-0 block"
            style={{
              left: `${p.left}%`,
              width: p.w,
              height: p.round ? p.w : p.w * 1.6,
              background: p.color,
              borderRadius: p.round ? "50%" : 2,
              animation: `confetti-fall ${p.dur}s ${p.delay}s cubic-bezier(.25,.6,.4,1) forwards`,
              ["--drift" as string]: p.drift,
              ["--spin" as string]: p.spin,
            }}
          />
        ))}
      </div>
      <div className="pop-in bubble relative flex flex-col items-center gap-3 bg-surface p-8 text-center ring-4 ring-ink">
        <Sid mood="celebrating" className="size-32" />
        <h2 id="celebrate-title" className="font-hand text-4xl font-bold text-ink">
          <span className="marked">{safe ? t.safeTitle : t.celebrate}</span>
        </h2>
        <p className="text-xl text-ink-soft">{safe ? t.safeSub : summary || t.celebrateSub}</p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <button
            type="button"
            autoFocus
            onClick={onStartOver}
            className="h-14 w-full rounded-full bg-mark text-lg font-bold text-on-mark shadow-[0_0.25rem_0_0_var(--ink)] active:translate-y-1 active:shadow-none"
          >
            {t.startOver}
          </button>
          <form method="dialog">
            <button className="h-12 w-full rounded-full font-semibold text-ink ring-1 ring-line hover:bg-surface-2">{t.close}</button>
          </form>
        </div>
      </div>
    </dialog>
  );
}

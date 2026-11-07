"use client";

import { useEffect, useState } from "react";
import type { PreparedImage } from "@/lib/image";
import { isRtl, type Strings } from "@/lib/i18n";
import type { SidResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { VERDICT } from "./result-view";
import { Sid } from "./sid";

export type PartialResult = Partial<Omit<SidResult, "scam" | "steps">> & {
  scam?: Partial<SidResult["scam"]>;
  steps?: Partial<SidResult["steps"][number]>[];
};

const Bar = ({ className }: { className?: string }) => (
  <span className={cn("block rounded-full bg-surface-2 motion-safe:animate-pulse", className)} aria-hidden="true" />
);

/**
 * While Sid works: the user's own question and screenshot, Sid's progress in plain words,
 * and the answer filling in as it streams (title and verdict first), over a skeleton.
 */
export function PendingView({
  t,
  text,
  image,
  partial,
  fromLive = false,
}: {
  t: Strings;
  text: string;
  image: PreparedImage | null;
  partial: PartialResult | null;
  /** Live help failed and this is the screenshot fallback: label it as such, not with transcript text */
  fromLive?: boolean;
}) {
  const lines = image ? [...t.progressImage] : [...t.progressText];
  if (/https?:\/\/|www\.|\.[a-z]{2,3}\//i.test(text)) lines.splice(1, 0, t.progressLink);
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((i) => Math.min(i + 1, lines.length - 1)), 1800);
    return () => clearInterval(id);
  }, [lines.length]);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);

  const p = partial ?? {};
  const lang = p.language || undefined;
  const dir = lang && isRtl(lang) ? "rtl" : "ltr";
  const verdict = p.mode === "scam_check" && p.scam?.verdict && p.scam.verdict in VERDICT ? (p.scam.verdict as keyof typeof VERDICT) : null;
  const V = verdict ? VERDICT[verdict] : null;
  const steps = (p.steps ?? []).filter((s) => s.instruction);

  return (
    <section className="flex flex-col gap-5 py-2" aria-busy="true">
      {/* What the user sent */}
      {(text.trim() || image) && (
        <div className="flex flex-col items-end gap-2 self-end">
          <p className="text-sm font-semibold text-ink-soft">{fromLive ? t.fromLive : t.youAsked}</p>
          {text.trim() && (
            <p className="bubble-user max-w-md bg-ink px-4 py-3 text-lg text-paper" dir="auto">
              {text}
            </p>
          )}
          {image && (
            <div className="relative overflow-hidden rounded-[1.25rem] border-4 border-ink">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own screenshot */}
              <img src={image.url} alt="" width={image.width} height={image.height} className="block h-auto max-h-[38vh] w-auto opacity-85" />
              <span
                className="absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent via-mark/50 to-transparent motion-safe:animate-[scan_1.6s_ease-in-out_infinite_alternate]"
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      )}

      {/* Sid at work */}
      <div className="flex items-end gap-3">
        <Sid mood="thinking" className="size-20 shrink-0" />
        <p className="bubble flex items-center gap-2 bg-surface px-5 py-3 text-xl font-semibold text-ink ring-1 ring-line" role="status" aria-live="polite">
          {p.title ? t.progressImage[t.progressImage.length - 1] : slow ? t.slow : lines[n]}
          <span className="flex gap-1" aria-hidden="true">
            <span className="dot size-2 rounded-full bg-ink" />
            <span className="dot size-2 rounded-full bg-ink [animation-delay:.15s]" />
            <span className="dot size-2 rounded-full bg-ink [animation-delay:.3s]" />
          </span>
        </p>
      </div>

      {/* The answer, as it arrives */}
      <div className="flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line" lang={lang} dir={dir}>
        {p.title ? (
          <h1 className="pop-in text-3xl leading-tight font-bold text-ink">{p.title}</h1>
        ) : (
          <Bar className="h-8 w-3/4" />
        )}
        {V && verdict && (
          <div className={cn("pop-in flex items-center gap-3 rounded-2xl p-4 ring-2", V.box)}>
            <V.icon className="size-9 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            <p className="text-2xl leading-tight font-bold">{t.verdict[verdict]}</p>
          </div>
        )}
        {p.summary ? (
          <p className="text-xl text-ink">{p.summary}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
          </div>
        )}
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-mark bg-mark/15 p-3 text-lg font-semibold text-ink">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mark text-on-mark ring-1 ring-ink" aria-hidden="true">
                {i + 1}
              </span>
              <mark className="rounded bg-mark px-1 text-on-mark [box-decoration-break:clone]">{s.instruction}</mark>
            </li>
          ))}
          {Array.from({ length: Math.max(0, 3 - steps.length) }, (_, i) => (
            <li key={`s${i}`} className="flex items-center gap-3" aria-hidden="true">
              <Bar className="size-8 shrink-0" />
              <Bar className={cn("h-4", i % 2 ? "w-1/2" : "w-2/3")} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

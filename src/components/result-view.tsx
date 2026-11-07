"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Lightbulb,
  MessageCircleHeart,
  Pointer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Globe,
  Info,
  TriangleAlert,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Strings } from "@/lib/i18n";
import { isRtl } from "@/lib/i18n";
import type { PreparedImage } from "@/lib/image";
import { canSpeak, speak, stopSpeaking } from "@/lib/speech";
import type { Mode, SidResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Sid, type Mood } from "./sid";
import { TapSpot } from "./tap-spot";

const MODE_STYLE: Record<Mode, { icon: typeof Pointer; chip: string }> = {
  show_me: { icon: Pointer, chip: "bg-sky-bg text-sky" },
  fix_it: { icon: Wrench, chip: "bg-fix-bg text-fix" },
  scam_check: { icon: ShieldAlert, chip: "bg-danger-bg text-danger" },
  explain_it: { icon: Lightbulb, chip: "bg-learn-bg text-learn" },
};

export const VERDICT = {
  scam: { icon: ShieldAlert, box: "bg-danger-bg text-danger ring-danger" },
  suspicious: { icon: ShieldQuestion, box: "bg-caution-bg text-caution ring-caution" },
  check_address: { icon: Globe, box: "bg-caution-bg text-caution ring-caution" },
  looks_safe: { icon: ShieldCheck, box: "bg-safe-bg text-safe ring-safe" },
} as const;

/** "Looks safe" and "Check the address" get calm wording, never warnings. */
const isCalm = (r: SidResult) => r.scam.verdict === "looks_safe" || r.scam.verdict === "check_address";

export function moodFor(r: SidResult): Mood {
  if (r.done) return "celebrating";
  if (r.mode === "scam_check" && (r.scam.verdict === "scam" || r.scam.verdict === "suspicious")) return "worried";
  return "helping";
}

export function speechFor(r: SidResult, step: number, t: Strings) {
  const parts = [r.title + ".", r.summary];
  if (r.mode === "scam_check" && r.scam.verdict) {
    parts.unshift(t.verdict[r.scam.verdict] + ".");
    const calm = isCalm(r);
    if (r.scam.do_not.length) parts.push((calm ? t.goodToKnow : t.doNot) + ": " + r.scam.do_not.join(". "));
    if (r.scam.how_to_close.length) parts.push((calm ? t.toBeSure : t.howToClose) + ": " + r.scam.how_to_close.join(". "));
  } else if (r.mode === "fix_it") {
    parts.push(r.fix.what_went_wrong, r.fix.likely_cause);
  } else if (r.mode === "explain_it") {
    parts.push(r.explain.answer, ...r.explain.key_points);
  }
  const s = r.steps[step];
  if (s && r.mode !== "scam_check") parts.push(t.step(step + 1, r.steps.length) + ". " + s.instruction + ". " + s.detail);
  if (r.next_hint) parts.push(r.next_hint);
  return parts.filter(Boolean).join(" ");
}

export function ResultView({
  result,
  image,
  t,
  simple,
  busy,
  onNextScreenshot,
  onFixed,
  onStartOver,
  onAskFamily,
  reply,
}: {
  result: SidResult;
  image: PreparedImage | null;
  t: Strings;
  simple: boolean;
  busy: boolean;
  onNextScreenshot: (file: File) => void;
  onFixed: () => void;
  onStartOver: () => void;
  onAskFamily: () => void;
  reply?: ReactNode;
}) {
  const [step, setStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const r = result;
  const dir = isRtl(r.language) ? "rtl" : "ltr";
  const mood = moodFor(r);
  const ModeIcon = MODE_STYLE[r.mode].icon;
  const current = r.steps[step];
  const speechText = useMemo(() => speechFor(r, step, t), [r, step, t]);

  // New result: back to step 1, move focus to the answer, and read it out in Simple mode.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when a new result arrives
    setStep(0);
    headingRef.current?.focus();
    if (simple && canSpeak()) {
      setSpeaking(true);
      speak(speechFor(r, 0, t), r.language, () => setSpeaking(false));
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  function toggleSpeak() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speak(speechText, r.language, () => setSpeaking(false));
    }
  }

  const showSteps = r.mode !== "scam_check" && r.steps.length > 0;
  const tapBox = r.mode === "scam_check" ? r.steps[0]?.box_2d : step === 0 ? current?.box_2d : undefined;

  return (
    <article className="flex flex-col gap-5" aria-busy={busy}>
      {/* Sid's answer bubble */}
      <div className="flex items-end gap-3">
        <Sid mood={mood} className="size-16 sm:size-20" />
        <div className="bubble min-w-0 flex-1 bg-surface p-4 ring-1 ring-line sm:p-5" lang={r.language} dir={dir}>
          <p
            className={cn(
              "mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
              MODE_STYLE[r.mode].chip,
            )}
            lang={undefined}
          >
            <ModeIcon className="size-4" aria-hidden="true" />
            {t.modes[r.mode]}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl leading-tight font-bold text-balance text-ink outline-none sm:text-3xl"
          >
            {r.title}
          </h1>
          {r.summary && <p className="mt-2 text-lg leading-relaxed text-ink-soft text-pretty">{r.summary}</p>}
        </div>
      </div>

      {r.sensitive_info_visible && (
        <div role="alert" className="flex gap-3 rounded-2xl bg-caution-bg p-4 text-caution ring-2 ring-caution">
          <TriangleAlert className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <p className="text-lg font-semibold">{t.sensitive}</p>
        </div>
      )}

      {/* Scam verdict */}
      {r.mode === "scam_check" && r.scam.verdict && <Verdict result={r} t={t} dir={dir} />}

      {/* Fix it: what happened */}
      {r.mode === "fix_it" && (r.fix.what_went_wrong || r.fix.likely_cause) && (
        <div className="grid gap-3 sm:grid-cols-2" lang={r.language} dir={dir}>
          {r.fix.what_went_wrong && (
            <section className="rounded-2xl bg-fix-bg p-4">
              <h2 className="text-sm font-bold text-fix">{t.whatWentWrong}</h2>
              <p className="mt-1 text-lg text-ink">{r.fix.what_went_wrong}</p>
            </section>
          )}
          {r.fix.likely_cause && (
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="text-sm font-bold text-ink-soft">{t.likelyCause}</h2>
              <p className="mt-1 text-lg text-ink">{r.fix.likely_cause}</p>
            </section>
          )}
        </div>
      )}

      {/* Explain it */}
      {r.mode === "explain_it" && (
        <section lang={r.language} dir={dir} className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <p className={cn("leading-relaxed text-ink text-pretty", simple ? "text-2xl" : "text-xl")}>
            {r.explain.answer}
          </p>
          {r.explain.key_points.length > 0 && (
            <>
              <h2 className="mt-5 text-sm font-bold text-learn">{t.keyPoints}</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {r.explain.key_points.map((k, i) => (
                  <li key={i} className="flex gap-2 text-lg text-ink">
                    <Lightbulb className="mt-1 size-5 shrink-0 text-learn" aria-hidden="true" />
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* The big instruction for the current step */}
      {showSteps && current && (
        <section lang={r.language} dir={dir} aria-labelledby="sid-step" className="flex flex-col gap-3 rounded-2xl border-2 border-mark bg-mark/15 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <p className="font-hand text-lg font-bold text-ink-soft" aria-live="polite">
              {r.mode === "fix_it" && <span className="me-2">{t.howToFix} ·</span>}
              {t.step(step + 1, r.steps.length)}
            </p>
            <div className="flex flex-1 gap-1" aria-hidden="true">
              {r.steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i < step ? "bg-ink" : i === step ? "bg-mark ring-1 ring-ink" : "bg-surface-2",
                  )}
                />
              ))}
            </div>
          </div>
          <h2
            id="sid-step"
            className={cn(
              "leading-tight font-bold text-balance text-ink",
              simple ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
            )}
          >
            <mark className="rounded-lg bg-mark px-1 text-on-mark [box-decoration-break:clone]">{current.instruction}</mark>
          </h2>
          {current.detail && <p className="text-lg text-ink-soft text-pretty">{current.detail}</p>}
        </section>
      )}

      {/* Screenshot with the tap ring */}
      {image && (
        <TapSpot
          key={`${step}-${image.url.length}`}
          src={image.url}
          width={image.width}
          height={image.height}
          box={tapBox}
          hereText={{ tap: t.tapHere, click: t.clickHere }}
          tone={r.mode === "scam_check" ? "safe" : "mark"}
          alt={current?.target_label || r.title}
        />
      )}

      {r.mode === "scam_check" && <ScamReasons result={r} t={t} dir={dir} />}

      {showSteps && r.steps.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex h-12 items-center gap-2 rounded-full bg-surface px-5 font-semibold text-ink ring-1 ring-line disabled:opacity-40"
          >
            <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
            {t.previous}
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(r.steps.length - 1, s + 1))}
            disabled={step === r.steps.length - 1}
            className="flex h-12 items-center gap-2 rounded-full bg-surface px-5 font-semibold text-ink ring-1 ring-line disabled:opacity-40"
          >
            {t.next}
            <ArrowRight className="size-5 rtl:rotate-180" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-1">
        {reply}
        {r.next_hint && !r.done && (r.mode === "show_me" || r.mode === "fix_it") && (
          <p lang={r.language} dir={dir} className="font-hand text-lg text-ink-soft">
            {r.next_hint}
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onNextScreenshot(f);
            e.target.value = "";
          }}
        />
        {r.mode !== "explain_it" && (
          <div className={cn("grid gap-3", r.mode !== "scam_check" && "sm:grid-cols-2")}>
            {/* A next screenshot only makes sense while working through steps, not for scam checks */}
            {r.mode !== "scam_check" && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-mark px-6 text-lg font-bold text-on-mark shadow-[0_0.25rem_0_0_var(--ink)] transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              <Camera className="size-5" aria-hidden="true" />
              {t.nextStep}
            </button>
            )}
            <button
              type="button"
              onClick={onFixed}
              disabled={busy}
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-safe-bg px-6 text-lg font-bold text-safe ring-2 ring-safe disabled:opacity-50"
            >
              <Check className="size-5" aria-hidden="true" />
              {r.mode === "scam_check" ? t.gotIt : t.allFixed}
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {canSpeak() && (
            <button
              type="button"
              onClick={toggleSpeak}
              aria-pressed={speaking}
              className="flex h-12 items-center gap-2 rounded-full bg-surface px-4 font-semibold text-ink ring-1 ring-line hover:ring-sky"
            >
              {speaking ? (
                <VolumeX className="size-5" aria-hidden="true" />
              ) : (
                <Volume2 className="size-5" aria-hidden="true" />
              )}
              {speaking ? t.stopReading : t.readAloud}
            </button>
          )}
          <button
            type="button"
            onClick={onAskFamily}
            className="flex h-12 items-center gap-2 rounded-full bg-surface px-4 font-semibold text-ink ring-1 ring-line hover:ring-sky"
          >
            <MessageCircleHeart className="size-5" aria-hidden="true" />
            {t.askFamily}
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="flex h-12 items-center gap-2 rounded-full px-4 font-semibold text-ink-soft hover:text-ink"
          >
            <RotateCcw className="size-5" aria-hidden="true" />
            {t.startOver}
          </button>
        </div>
      </div>
    </article>
  );
}

function ScamReasons({ result: r, t, dir }: { result: SidResult; t: Strings; dir: "ltr" | "rtl" }) {
  if (!r.scam.reasons.length) return null;
  return (
    <section lang={r.language} dir={dir} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-sm font-bold text-ink-soft">{t.whyScam}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {r.scam.reasons.map((x, i) => (
          <li key={i} className="flex gap-2 text-lg text-ink">
            <span className="mt-2.5 size-2 shrink-0 rounded-full bg-ink" aria-hidden="true" />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Verdict({ result: r, t, dir }: { result: SidResult; t: Strings; dir: "ltr" | "rtl" }) {
  const v = r.scam.verdict as keyof typeof VERDICT;
  const V = VERDICT[v];
  const calm = isCalm(r);
  return (
    <section className="flex flex-col gap-4" lang={r.language} dir={dir}>
      <div className={cn("pop-in flex items-center gap-4 rounded-3xl p-5 ring-2", V.box)}>
        <V.icon className="size-12 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        <p className="text-3xl leading-tight font-bold">{t.verdict[v]}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {r.scam.do_not.length > 0 && (
          <section className={cn("rounded-2xl p-4", calm ? "bg-surface ring-1 ring-line" : "bg-danger-bg")}>
            <h2 className={cn("text-sm font-bold", calm ? "text-ink-soft" : "text-danger")}>{calm ? t.goodToKnow : t.doNot}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {r.scam.do_not.map((x, i) => (
                <li key={i} className="flex gap-2 text-lg text-ink">
                  {calm ? (
                    <Info className="mt-1 size-5 shrink-0 text-ink-soft" aria-hidden="true" />
                  ) : (
                    <X className="mt-1 size-5 shrink-0 text-danger" strokeWidth={3} aria-hidden="true" />
                  )}
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {r.scam.how_to_close.length > 0 && (
          <section className="rounded-2xl bg-safe-bg p-4">
            <h2 className="text-sm font-bold text-safe">{calm ? t.toBeSure : t.howToClose}</h2>
            <ol className="mt-2 flex flex-col gap-2">
              {r.scam.how_to_close.map((x, i) => (
                <li key={i} className="flex gap-2 text-lg text-ink">
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-safe text-sm font-bold text-safe-bg"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span>{x}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </section>
  );
}

"use client";

import { LockKeyhole, Radio, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Demo } from "@/lib/demos";
import { LIVE_STRINGS, type LiveCopy } from "@/lib/live-i18n";
import { liveSupported, type Frame, type LiveSource } from "@/lib/live-session";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { usePrefs } from "@/lib/prefs";
import { stopSpeaking } from "@/lib/speech";
import type { Strings } from "@/lib/i18n";
import type { Mode, SidError, SidResult, Turn } from "@/lib/types";
import { Celebration } from "./celebration";
import { Composer } from "./composer";
import { FamilySheet } from "./family-sheet";
import { Header } from "./header";
import { LivePreflight, LiveView } from "./live-view";
import { ModeGuide } from "./mode-guide";
import { PendingView, type PartialResult } from "./pending-view";
import { ResultView } from "./result-view";
import { Sid, type Mood } from "./sid";
import { isPhoneShot, TapSpot } from "./tap-spot";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "result" | "error" | "live-pre" | "live";
type AskRequest = { text: string; image: PreparedImage | null; history: Turn[]; demo?: Demo; fromLive?: boolean };

export function SidekickApp() {
  const { prefs, update, isDark, t, langMeta } = usePrefs();
  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SidResult | null>(null);
  const [shownImage, setShownImage] = useState<PreparedImage | null>(null);
  const [problem, setProblem] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [error, setError] = useState<SidError | null>(null);
  const [notice, setNotice] = useState("");
  // "fixed" / "safe" only after the user taps It's fixed / Got it; never automatically
  const [celebrating, setCelebrating] = useState<false | "fixed" | "safe">(false);
  const [family, setFamily] = useState(false);
  const [familyImage, setFamilyImage] = useState<PreparedImage | null>(null);
  const [liveSource, setLiveSource] = useState<LiveSource>("screen");
  const [canLive, setCanLive] = useState(false);
  const lc = LIVE_STRINGS[prefs.lang];
  // Sid's face on the home screen follows what's happening: hovering a scam question, a screenshot added, typing
  const [hoverMode, setHoverMode] = useState<Mode | null>(null);
  const heroMood: Mood = hoverMode
    ? ({ show_me: "happy", scam_check: "worried", fix_it: "thinking", explain_it: "thinking" } as const)[hoverMode]
    : image
      ? "happy"
      : text.trim()
        ? "thinking"
        : "helping";
  // Home, waiting, answer and error share the two-column layout; live help gets the whole page
  const split = status !== "live" && status !== "live-pre";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability check after mount
    setCanLive(liveSupported());
  }, []);

  const frameToImage = (f: Frame): PreparedImage => ({ ...f, mimeType: "image/jpeg" });

  function liveFailed(message: string, frame: Frame | null, lastQuestion: string) {
    // Live help failed: fall back to screenshot help automatically, using the last frame Sid saw.
    setNotice(`${message} ${lc.failed}`);
    if (frame) {
      const img = frameToImage(frame);
      setImage(img);
      setProblem(lastQuestion);
      ask({ text: lastQuestion, image: img, history: [], fromLive: true });
    } else {
      setStatus("idle");
    }
  }
  const [lastRequest, setLastRequest] = useState<AskRequest | null>(null);
  const [partial, setPartial] = useState<PartialResult | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [fromLive, setFromLive] = useState(false);
  const [answeredMs, setAnsweredMs] = useState<number | null>(null);
  const askCtrl = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  // The browser tab says what Sid is doing
  useEffect(() => {
    const base = "Sid, your tech sidekick";
    if (status === "loading") {
      document.title = "Sid is thinking… • " + base;
    } else if (status === "result" && result?.mode === "scam_check" && (result.scam.verdict === "scam" || result.scam.verdict === "suspicious")) {
      document.title = "\u{1F6A8} Scam found • " + base;
    } else if (status === "live") {
      document.title = "\u{1F7E2} Live • " + base;
    } else {
      document.title = base;
    }
  }, [status, result]);

  function showResult(r: SidResult, req: { text: string; history: Turn[] }) {
    setResult(r);
    setText("");
    setImage(null);
    setStatus("result");
    setHistory([
      ...req.history,
      {
        question: req.text,
        mode: r.mode,
        title: r.title,
        told_user: [r.summary, ...r.steps.flatMap((step) => [step.instruction, step.detail]), r.explain.answer, r.next_hint].filter(Boolean).join(" "),
      },
    ]);
  }

  async function ask(req: AskRequest) {
    askCtrl.current?.abort();
    const ctrl = new AbortController();
    askCtrl.current = ctrl;
    const t0 = performance.now();
    setLastRequest(req);
    setStatus("loading");
    setError(null);
    setPartial(null);
    setAnsweredMs(null);
    setPendingText(req.text);
    setFromLive(!!req.fromLive);
    setShownImage(req.image);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const fail = (err: SidError) => {
      if (ctrl.signal.aborted) return;
      // Demos still work without a connection: fall back to the saved answer.
      if (req.demo?.cached) return showResult(req.demo.cached, req);
      // Give their words back so they can fix or resend them
      if (!req.fromLive) setText((cur) => cur || req.text);
      setError(err);
      setStatus("error");
    };
    const offline = (): SidError => ({ error: "network", message: t.errors.network });

    let res: Response;
    try {
      res = await fetch("/api/sid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          image: req.image ? { data: req.image.data, mimeType: req.image.mimeType } : null,
          device: req.image ? (isPhoneShot(req.image.width, req.image.height) ? "phone" : "computer") : undefined,
          uiLanguage: prefs.lang,
          history: req.history,
        }),
        signal: ctrl.signal,
      });
    } catch {
      return fail(offline());
    }

    // Errors come back as plain JSON; answers stream as NDJSON (title and verdict first)
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("ndjson") || !res.body) {
      const body = await res.json().catch(() => null);
      return fail(body?.error ? body : { error: "model_failed", message: t.errors.model_failed });
    }
    try {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line || ctrl.signal.aborted) continue;
          const ev = JSON.parse(line);
          if (ev.t === "partial") setPartial(ev.data);
          else if (ev.t === "restart") setPartial(null); // the server switched models half-way
          else if (ev.t === "done") {
            setAnsweredMs(performance.now() - t0);
            return showResult(ev.result as SidResult, req);
          } else if (ev.t === "error") return fail(ev);
        }
      }
      fail(offline()); // the stream ended without an answer
    } catch {
      fail(offline());
    }
  }

  function submit(override?: { text?: string }) {
    const q = override?.text ?? text;
    if (!q.trim() && !image) return;
    if (status !== "result") setProblem(q);
    ask({ text: q, image, history: status === "result" ? history : [] });
    // The question moves to the answer side; leave the box ready for the next one
    setText("");
    setImage(null);
  }

  async function nextScreenshot(file: File) {
    try {
      const img = await prepareImage(file);
      setImage(img);
      requestAnimationFrame(() => {
        const question = document.getElementById("sid-question");
        question?.scrollIntoView({ behavior: "smooth", block: "center" });
        question?.focus({ preventScroll: true });
      });
    } catch {
      setNotice(t.errors.unsupported);
    }
  }

  // A question from "Things people ask me": fill the box, don't send
  function pickExample(q: string) {
    setText(q);
    requestAnimationFrame(() => {
      const box = document.getElementById("sid-question") as HTMLTextAreaElement | null;
      box?.scrollIntoView({ behavior: "smooth", block: "center" });
      box?.focus({ preventScroll: true });
      box?.setSelectionRange(q.length, q.length);
    });
  }

  function startOver() {
    askCtrl.current?.abort();
    stopSpeaking();
    setStatus("idle");
    setResult(null);
    setHistory([]);
    setText("");
    setImage(null);
    setShownImage(null);
    setProblem("");
    setCelebrating(false);
    requestAnimationFrame(() => document.getElementById("sid-question")?.focus());
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-full focus:bg-mark focus:px-4 focus:py-2 focus:text-on-mark"
      >
        Skip to content
      </a>
      <Header prefs={prefs} update={update} isDark={isDark} t={t} onHome={startOver} wide={status === "live"} split={split} />

      <main
        id="main"
        ref={mainRef}
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-4 pb-16 sm:px-6",
          status === "live" ? "max-w-6xl" : split ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl",
        )}
      >
        {split && status === "idle" && (
          <section className="flex items-end gap-3 sm:gap-5" aria-labelledby="hello">
            <Sid mood={heroMood} className="-mb-1 size-20 sm:size-28 lg:size-32" label="Sid" track />
            <div className="bubble min-w-0 flex-1 bg-surface px-5 pt-4 pb-5 text-ink ring-1 ring-line sm:px-7 lg:flex-none">
              <p id="hello" className="font-hand text-xl font-bold text-ink-soft">
                {t.hello}
              </p>
              <h1 className="mt-1 max-w-[22ch] font-hand text-3xl leading-[1.12] font-bold text-balance sm:text-4xl lg:text-5xl">{t.ask}</h1>
            </div>
          </section>
        )}

        {split && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
            {/* LEFT: live help, how Sid helps, and why it's safe. Sticks while the right side scrolls.
                Once Sid is answering, their question shows here and Sid's answer on the right. */}
            <div className={cn("flex min-w-0 flex-col gap-6 lg:sticky lg:top-6", status !== "idle" && "hidden lg:flex")}>
              {/* While Sid answers: their question stays on this side, Sid's answer is on the right */}
              {(status === "result" || status === "error") && lastRequest && (
                <section className="flex flex-col items-end gap-1" aria-label={t.youAsked}>
                  <p className="px-1 font-hand text-base font-bold text-ink-soft">{lastRequest.fromLive ? t.fromLive : t.youAsked}</p>
                  {lastRequest.text && !lastRequest.fromLive && (
                    <p className="bubble-user max-w-full bg-sky-bg px-4 py-3 text-lg text-ink" dir="auto">
                      {lastRequest.text}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={startOver}
                    className="mt-2 flex h-12 items-center gap-2 rounded-full bg-surface px-5 font-semibold text-ink ring-1 ring-line hover:ring-sky"
                  >
                    <RotateCcw className="size-5" aria-hidden="true" />
                    {t.startOver}
                  </button>
                </section>
              )}

              {canLive && <LiveCard lc={lc} t={t} big={prefs.simple && status === "idle"} onStart={() => setStatus("live-pre")} />}
              {status === "idle" && <HowItWorks t={t} />}
              <TrustStrip t={t} />
            </div>

            {/* RIGHT: the screenshot and question side (first), then the corkboard of examples. What they add and what Sid answers sit at
                the top; the text box is at the bottom, like a conversation. */}
            <div className="flex min-w-0 flex-col gap-5">
              {status === "idle" && (
                <>
                  {canLive && <h2 className="px-1 font-hand text-xl font-bold text-ink lg:text-2xl">{lc.orScreenshot}</h2>}
                  {image && <ScreenshotStage image={image} line={t.gotScreenshot} />}
                  <ModeGuide
                    t={t}
                    simple={prefs.simple}
                    onPick={pickExample}
                    onMood={setHoverMode}
                    className={cn("order-last", image && "lg:hidden")}
                  />
                </>
              )}

              {status === "loading" && <PendingView t={t} text={fromLive ? "" : pendingText} image={shownImage} partial={partial} fromLive={fromLive} />}

              {status === "error" && error && (
                <section role="alert" className="flex flex-col items-center gap-4 rounded-2xl bg-surface px-4 py-8 text-center ring-1 ring-line">
                  <Sid mood="worried" className="size-24" />
                  <h1 className="font-hand text-3xl font-bold text-ink">{t.errorTitle}</h1>
                  <p className="max-w-md text-lg text-ink-soft">{t.errors[error.error] ?? error.message}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {error.error !== "bad_input" && lastRequest && (
                      <button
                        type="button"
                        onClick={() => ask(lastRequest)}
                        className="btn-ink h-12 rounded-full px-6 font-bold"
                      >
                        {t.tryAgain}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={startOver}
                      className="flex h-12 items-center gap-2 rounded-full bg-surface px-5 font-semibold text-ink ring-1 ring-line"
                    >
                      <RotateCcw className="size-5" aria-hidden="true" />
                      {t.startOver}
                    </button>
                  </div>
                </section>
              )}

              {status === "result" && result && (
                <ResultView
                  result={result}
                  image={shownImage}
                  t={t}
                  simple={prefs.simple}
                  busy={false}
                  onNextScreenshot={nextScreenshot}
                  onFixed={() => setCelebrating(result.mode === "scam_check" ? "safe" : "fixed")}
                  onStartOver={startOver}
                  onAskFamily={() => setFamily(true)}
                  reply={
                    // The same conversation continues: the reply box lives inside Sid's answer
                    <section className="flex flex-col gap-2" aria-label={t.followUp}>
                      <p className="px-1 text-ink-soft">{t.followUpHelp}</p>
                      <Composer
                        t={{ ...t, ask: t.followUp }}
                        followUp
                        speechLang={langMeta.speech}
                        text={text}
                        setText={setText}
                        image={image}
                        setImage={setImage}
                        onSubmit={submit}
                        simple={prefs.simple}
                        onNotice={setNotice}
                      />
                    </section>
                  }
                />
              )}
              {status === "result" && answeredMs !== null && (
                <p className="text-center text-sm text-ink-soft">{t.answeredIn((answeredMs / 1000).toFixed(1))}</p>
              )}

              {status !== "result" && (
                <div className="flex flex-col gap-2">
                  <Composer
                    t={t}
                    speechLang={langMeta.speech}
                    text={text}
                    setText={setText}
                    image={image}
                    setImage={setImage}
                    onSubmit={submit}
                    simple={prefs.simple}
                    onNotice={setNotice}
                    hideThumb={status === "idle"}
                  />
                  <p className="flex items-center gap-2 px-2 text-sm text-ink-soft lg:hidden">
                    <ShieldCheck className="size-4 shrink-0 text-safe" aria-hidden="true" />
                    {t.neverAsk}
                  </p>
                </div>
              )}
              {status === "idle" && <p className="order-last px-1 text-sm text-ink-soft lg:hidden">{t.privacyNote}</p>}
            </div>
          </div>
        )}

        {status === "live-pre" && (
          <LivePreflight
            c={lc}
            onCancel={() => setStatus("idle")}
            onStart={(src) => {
              setLiveSource(src);
              setStatus("live");
            }}
          />
        )}

        {status === "live" && (
          <LiveView
            c={lc}
            lang={prefs.lang}
            source={liveSource}
            simple={prefs.simple}
            onEnd={() => setStatus((s) => (s === "live" ? "idle" : s))}
            onFail={liveFailed}
            onCelebrate={() => setCelebrating("fixed")}
            onAskFamily={(summary, frame) => {
              setProblem(summary);
              setFamilyImage(frame ? frameToImage(frame) : null);
              setFamily(true);
            }}
          />
        )}
      </main>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        {notice && (
          <p className="pop-in pointer-events-auto rounded-full bg-ink px-5 py-3 text-paper shadow-lg">{notice}</p>
        )}
      </div>

      {celebrating && (
        <Celebration
          t={t}
          summary={result?.done ? result.summary : undefined}
          safe={celebrating === "safe"}
          onClose={() => setCelebrating(false)}
          onStartOver={() => {
            setCelebrating(false);
            startOver();
          }}
        />
      )}
      {family && (
        <FamilySheet
          t={t}
          lang={prefs.lang}
          problem={problem}
          title={result?.title ?? ""}
          image={familyImage ?? shownImage}
          onClose={() => {
            setFamily(false);
            setFamilyImage(null);
          }}
        />
      )}
    </>
  );
}

/** "Get help live". Simple mode: a big panel with a picture of what Sid does. Standard: one compact row. */
function LiveCard({ lc, t, big, onStart }: { lc: LiveCopy; t: Strings; big: boolean; onStart: () => void }) {
  if (!big) {
    return (
      <section aria-labelledby="live-cta" className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 text-ink ring-2 ring-ink">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-paper" aria-hidden="true">
          <Radio className="size-5" />
          <span className="absolute -top-1 -end-1 size-3 rounded-full bg-danger ring-2 ring-surface motion-safe:animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="live-cta" className="text-lg leading-tight font-bold">
            {lc.cta}
          </h2>
          <p className="text-sm text-ink-soft">{lc.ctaSub}</p>
        </div>
        <button type="button" onClick={onStart} className="press h-11 basis-full rounded-full bg-mark px-5 font-bold text-on-mark">
          {lc.ctaButton}
        </button>
      </section>
    );
  }
  return (
    <section aria-labelledby="live-cta" className="rounded-3xl bg-surface p-5 text-ink ring-2 ring-ink">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <span className="relative mb-3 grid size-12 place-items-center rounded-xl bg-ink text-paper" aria-hidden="true">
            <Radio className="size-6" />
            <span className="absolute -top-1 -end-1 size-3.5 rounded-full bg-danger ring-2 ring-surface motion-safe:animate-pulse" />
          </span>
          <h2 id="live-cta" className="text-2xl leading-tight font-bold text-balance">
            {lc.cta}
          </h2>
          <p className="mt-2 text-ink-soft text-pretty">{lc.ctaSub}</p>
        </div>
        {/* A taste of what Sid does: the ring on the exact button */}
        <div className="h-36 w-24 shrink-0 rotate-3 overflow-hidden rounded-2xl sm:h-44 sm:w-32" aria-hidden="true">
          <TapSpot
            src="/demos/video-call.jpg"
            width={780}
            height={1688}
            box={[66, 622, 111, 706]}
            hereText={{ tap: t.tapHere, click: t.clickHere }}
            alt=""
            className="w-full border-[3px] border-ink shadow-none [&_.tap-media]:max-h-none [&_.tap-media]:w-full"
          />
        </div>
      </div>
      <button type="button" onClick={onStart} className="press mt-5 h-14 w-full rounded-full bg-mark text-lg font-bold text-on-mark">
        {lc.ctaButton}
      </button>
    </section>
  );
}

/** Wide screens: the screenshot they just added, big, with Sid asking for the words to go with it. */
function ScreenshotStage({ image, line }: { image: PreparedImage; line: string }) {
  const phone = isPhoneShot(image.width, image.height);
  return (
    <section className="hidden flex-col gap-4 lg:flex" aria-label={line}>
      <div className="flex items-end gap-3">
        <Sid mood="happy" className="size-16" />
        <p className="bubble max-w-md bg-surface px-4 py-3 font-hand text-lg font-bold text-ink ring-1 ring-line">{line}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
      <img
        src={image.url}
        alt=""
        className={cn(
          "self-center rounded-2xl border-2 border-ink bg-surface object-contain",
          phone ? "max-h-[40vh] w-auto max-w-[16rem]" : "max-h-[40vh] w-full",
        )}
      />
    </section>
  );
}

/** Three steps, in order: what happens when you ask Sid. */
function HowItWorks({ t }: { t: Strings }) {
  return (
    <section aria-labelledby="how-title" className="hidden flex-col gap-3 px-1 lg:flex">
      <h2 id="how-title" className="font-hand text-xl font-bold text-ink">
        {t.howTitle}
      </h2>
      <ol className="flex flex-col gap-3">
        {t.howSteps.map((step, i) => (
          <li key={i} className="flex items-start gap-3 text-ink">
            <span className="grid size-7 shrink-0 place-items-center rounded-full font-hand font-bold ring-2 ring-ink" aria-hidden="true">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Why it's safe to use Sid, said once, plainly. */
function TrustStrip({ t }: { t: Strings }) {
  return (
    <ul className="hidden flex-col gap-2 rounded-2xl bg-safe-bg p-4 text-sm text-ink lg:flex">
      <li className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-safe" aria-hidden="true" />
        {t.neverAsk}
      </li>
      <li className="flex items-start gap-2">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-safe" aria-hidden="true" />
        {t.privacyNote}
      </li>
    </ul>
  );
}

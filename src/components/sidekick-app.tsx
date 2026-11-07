"use client";

import { Radio, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEMOS, type Demo } from "@/lib/demos";
import { LIVE_STRINGS } from "@/lib/live-i18n";
import { liveSupported, type Frame, type LiveSource } from "@/lib/live-session";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { usePrefs } from "@/lib/prefs";
import { stopSpeaking } from "@/lib/speech";
import type { SidError, SidResult, Turn } from "@/lib/types";
import { Celebration } from "./celebration";
import { Composer } from "./composer";
import { FamilySheet } from "./family-sheet";
import { Header } from "./header";
import { LivePreflight, LiveView } from "./live-view";
import { ModeGuide } from "./mode-guide";
import { PendingView, type PartialResult } from "./pending-view";
import { ResultView } from "./result-view";
import { Sid } from "./sid";
import { TapSpot } from "./tap-spot";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "result" | "error" | "live-pre" | "live";
type AskRequest = { text: string; image: PreparedImage | null; history: Turn[]; demo?: Demo };

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
  const [celebrating, setCelebrating] = useState(false);
  const [family, setFamily] = useState(false);
  const [familyImage, setFamilyImage] = useState<PreparedImage | null>(null);
  const [liveSource, setLiveSource] = useState<LiveSource>("screen");
  const [canLive, setCanLive] = useState(false);
  const lc = LIVE_STRINGS[prefs.lang];

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
      ask({ text: lastQuestion, image: img, history: [] });
    } else {
      setStatus("idle");
    }
  }
  const [lastRequest, setLastRequest] = useState<AskRequest | null>(null);
  const [partial, setPartial] = useState<PartialResult | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [answeredMs, setAnsweredMs] = useState<number | null>(null);
  const askCtrl = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  function showResult(r: SidResult, req: { text: string; history: Turn[] }) {
    setResult(r);
    setStatus("result");
    setHistory([
      ...req.history,
      {
        question: req.text,
        mode: r.mode,
        title: r.title,
        told_user: [r.summary, r.steps[0]?.instruction].filter(Boolean).join(" "),
      },
    ]);
    if (r.done) setCelebrating(true);
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
    setShownImage(req.image);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const fail = (err: SidError) => {
      if (ctrl.signal.aborted) return;
      // Demos still work without a connection: fall back to the saved answer.
      if (req.demo?.cached) return showResult(req.demo.cached, req);
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
    setProblem(q);
    ask({ text: q, image, history: [] });
  }

  async function nextScreenshot(file: File) {
    try {
      const img = await prepareImage(file);
      ask({ text: "", image: img, history });
    } catch {
      setNotice(t.errors.unsupported);
    }
  }

  async function runDemo(demo: Demo) {
    let img: PreparedImage | null = null;
    if (demo.image) {
      const blob = await (await fetch(demo.image)).blob();
      img = await prepareImage(blob);
    }
    setText(demo.prompt);
    setImage(img);
    setProblem(demo.prompt);
    if (demo.cached) {
      // Examples use a saved real answer from Sid: instant, and it spares the API quota.
      const req = { text: demo.prompt, image: img, history: [], demo };
      setLastRequest(req);
      setShownImage(img);
      setAnsweredMs(null);
      showResult(demo.cached, req);
      window.scrollTo({ top: 0 });
      return;
    }
    ask({ text: demo.prompt, image: img, history: [], demo });
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
      <Header prefs={prefs} update={update} isDark={isDark} t={t} onHome={startOver} wide={status === "live"} />

      <main
        id="main"
        ref={mainRef}
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-4 pb-16 sm:px-6",
          status === "live" ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        {status === "idle" && (
          <>
            <section className="flex items-end gap-3 sm:gap-4" aria-labelledby="hello">
              <Sid mood="helping" className="size-20 sm:size-28" label="Sid" />
              <div className="bubble flex-1 bg-surface p-4 text-ink ring-1 ring-line sm:p-5">
                <p id="hello" className="font-hand text-xl font-bold text-ink-soft sm:text-2xl">
                  {t.hello}
                </p>
                <h1 className="mt-1 text-2xl leading-tight font-bold text-balance sm:text-3xl">{t.ask}</h1>
              </div>
            </section>

            {canLive && (
              <section
                aria-labelledby="live-cta"
                className="relative overflow-hidden rounded-[1.75rem] bg-ink p-5 text-paper ring-1 ring-ink dark:bg-surface dark:text-ink dark:ring-line"
              >
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="relative mb-3 grid size-12 place-items-center rounded-2xl bg-mark text-on-mark">
                      <Radio className="size-6" aria-hidden="true" />
                      <span className="absolute -top-1 -end-1 size-3.5 rounded-full bg-danger ring-2 ring-ink motion-safe:animate-pulse dark:ring-surface" aria-hidden="true" />
                    </span>
                    <h2 id="live-cta" className="text-2xl leading-tight font-bold text-balance sm:text-3xl">
                      {lc.cta}
                    </h2>
                    <p className="mt-1 opacity-85 text-pretty">{lc.ctaSub}</p>
                  </div>
                  {/* A taste of what Sid does: the ring on the exact button */}
                  <div className="h-40 w-28 shrink-0 -rotate-3 overflow-hidden rounded-[1.1rem] sm:h-48 sm:w-36" aria-hidden="true">
                    <TapSpot
                      src="/demos/video-call.jpg"
                      width={780}
                      height={1688}
                      box={[66, 622, 111, 706]}
                      hereText={{ tap: t.tapHere, click: t.clickHere }}
                      alt=""
                      className="w-full border-[3px] border-mark shadow-none [&_.tap-media]:max-h-none [&_.tap-media]:w-full"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatus("live-pre")}
                  className="mt-4 h-14 w-full rounded-full bg-mark text-lg font-bold text-on-mark shadow-[0_0.25rem_0_0_#0b1030] active:translate-y-1 active:shadow-none"
                >
                  {lc.ctaButton}
                </button>
              </section>
            )}
            {canLive && <h2 className="-mb-3 font-hand text-xl font-bold text-ink">{lc.orScreenshot}</h2>}

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
            />
            <p className="-mt-3 flex items-center gap-2 px-2 text-sm text-ink-soft">
              <ShieldCheck className="size-4 shrink-0 text-safe" aria-hidden="true" />
              {t.neverAsk}
            </p>

            <section aria-labelledby="demos-title" className="flex flex-col gap-3">
              <h2 id="demos-title" className="font-hand text-xl font-bold text-ink">
                {t.tryOne}
              </h2>
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
                {DEMOS.map((d) => (
                  <li key={d.id} className="w-[11.5rem] shrink-0 snap-start sm:w-auto">
                    <button
                      type="button"
                      onClick={() => runDemo(d)}
                      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface text-start ring-1 ring-line transition-[box-shadow,transform] hover:-translate-y-0.5 hover:ring-2 hover:ring-sky"
                    >
                      {d.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small static thumbnail
                        <img
                          src={d.image}
                          alt=""
                          width={368}
                          height={200}
                          loading="lazy"
                          className="h-28 w-full object-cover object-top"
                        />
                      ) : (
                        <span
                          className="flex h-28 w-full items-center bg-sky-bg p-3 text-lg leading-snug font-semibold text-ink"
                          lang={d.lang}
                          dir="auto"
                        >
                          “{d.prompt}”
                        </span>
                      )}
                      <span className="flex flex-1 flex-col gap-1 p-3">
                        <span className="text-xs font-bold text-ink-soft">{t.modes[d.mode]}</span>
                        <span className="leading-snug font-semibold text-ink" lang={d.lang} dir="auto">
                          {d.label}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <ModeGuide t={t} />
            <p className="text-center text-sm text-ink-soft">{t.privacyNote}</p>
          </>
        )}

        {status === "loading" && <PendingView t={t} text={pendingText} image={shownImage} partial={partial} />}

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
            onCelebrate={() => setCelebrating(true)}
            onAskFamily={(summary, frame) => {
              setProblem(summary);
              setFamilyImage(frame ? frameToImage(frame) : null);
              setFamily(true);
            }}
          />
        )}

        {status === "error" && error && (
          <section role="alert" className="flex flex-col items-center gap-4 py-8 text-center">
            <Sid mood="worried" className="size-28" />
            <h1 className="text-2xl font-bold text-ink">{t.errorTitle}</h1>
            <p className="max-w-md text-lg text-ink-soft">{t.errors[error.error] ?? error.message}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {error.error !== "bad_input" && lastRequest && (
                <button
                  type="button"
                  onClick={() => ask(lastRequest)}
                  className="h-12 rounded-full bg-mark px-6 font-bold text-on-mark shadow-[0_0.25rem_0_0_var(--ink)] active:translate-y-1 active:shadow-none"
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
            onFixed={() => setCelebrating(true)}
            onStartOver={startOver}
            onAskFamily={() => setFamily(true)}
          />
        )}
        {status === "result" && answeredMs !== null && (
          <p className="text-center text-sm text-ink-soft">{t.answeredIn((answeredMs / 1000).toFixed(1))}</p>
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
          onClose={() => {
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

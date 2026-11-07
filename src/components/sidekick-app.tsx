"use client";

import { RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEMOS, type Demo } from "@/lib/demos";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { usePrefs } from "@/lib/prefs";
import { stopSpeaking } from "@/lib/speech";
import type { SidError, SidResult, Turn } from "@/lib/types";
import { Celebration } from "./celebration";
import { Composer } from "./composer";
import { FamilySheet } from "./family-sheet";
import { Header } from "./header";
import { ModeGuide } from "./mode-guide";
import { ResultView } from "./result-view";
import { Sid } from "./sid";

type Status = "idle" | "loading" | "result" | "error";
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
  const [lastRequest, setLastRequest] = useState<AskRequest | null>(null);
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
      setLastRequest(req);
      setStatus("loading");
      setError(null);
      setShownImage(req.image);
      window.scrollTo({ top: 0, behavior: "smooth" });
      try {
        const res = await fetch("/api/sid", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: req.text,
            image: req.image ? { data: req.image.data, mimeType: req.image.mimeType } : null,
            uiLanguage: prefs.lang,
            history: req.history,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || "error" in body) {
          // Demos still work without a connection: fall back to the saved answer.
          if (req.demo?.cached) {
            showResult(req.demo.cached, req);
            return;
          }
          setError(body?.error ? body : { error: "model_failed", message: "Sid couldn't be reached. Check your internet and try again." });
          setStatus("error");
          return;
        }
        showResult(body as SidResult, req);
      } catch {
        if (req.demo?.cached) {
          showResult(req.demo.cached, req);
          return;
        }
        setError({ error: "model_failed", message: "Sid couldn't be reached. Check your internet and try again." });
        setStatus("error");
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
      setNotice("That picture couldn't be opened. Try a PNG or JPG screenshot.");
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
    ask({ text: demo.prompt, image: img, history: [], demo });
  }

  function startOver() {
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
      <Header prefs={prefs} update={update} isDark={isDark} t={t} onHome={startOver} />

      <main id="main" ref={mainRef} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-4 pb-16 sm:px-6">
        {status === "idle" && (
          <>
            <section className="flex items-end gap-3 sm:gap-4" aria-labelledby="hello">
              <Sid mood="helping" className="size-20 sm:size-28" label="Sid" />
              <div className="bubble flex-1 bg-ink p-4 text-paper sm:p-5 dark:bg-surface dark:text-ink dark:ring-1 dark:ring-line">
                <p id="hello" className="font-hand text-xl font-bold text-mark sm:text-2xl">
                  {t.hello}
                </p>
                <h1 className="mt-1 text-2xl leading-tight font-bold text-balance sm:text-3xl">{t.ask}</h1>
              </div>
            </section>

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

        {status === "loading" && <Thinking t={t} image={shownImage} />}

        {status === "error" && error && (
          <section role="alert" className="flex flex-col items-center gap-4 py-8 text-center">
            <Sid mood="worried" className="size-28" />
            <h1 className="text-2xl font-bold text-ink">{t.errorTitle}</h1>
            <p className="max-w-md text-lg text-ink-soft">{error.message}</p>
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
          image={shownImage}
          onClose={() => setFamily(false)}
        />
      )}
    </>
  );
}

function Thinking({ t, image }: { t: { thinking: string }; image: PreparedImage | null }) {
  return (
    <section className="flex flex-col items-center gap-5 py-6" aria-live="polite" aria-busy="true">
      <div className="flex items-end gap-3">
        <Sid mood="thinking" className="size-24" />
        <p className="bubble flex items-center gap-2 bg-surface px-5 py-3 text-xl font-semibold text-ink ring-1 ring-line">
          {t.thinking}
          <span className="flex gap-1" aria-hidden="true">
            <span className="dot size-2 rounded-full bg-ink" />
            <span className="dot size-2 rounded-full bg-ink [animation-delay:.15s]" />
            <span className="dot size-2 rounded-full bg-ink [animation-delay:.3s]" />
          </span>
        </p>
      </div>
      {image && (
        <div className="relative overflow-hidden rounded-[1.25rem] border-4 border-ink">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={image.url} alt="" className="block max-h-[55vh] w-auto opacity-80" />
          <span
            className="absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent via-mark/50 to-transparent motion-safe:animate-[scan_1.6s_ease-in-out_infinite_alternate]"
            aria-hidden="true"
          />
        </div>
      )}
    </section>
  );
}

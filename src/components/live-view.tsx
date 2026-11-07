"use client";

import {
  Camera,
  Check,
  EyeOff,
  Lock,
  MessageCircleHeart,
  Mic,
  MicOff,
  Monitor,
  Smartphone,
  PictureInPicture2,
  ShieldAlert,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LiveCopy } from "@/lib/live-i18n";
import { LiveSid, screenShareSupported, type Frame, type LiveEvent, type LiveSource } from "@/lib/live-session";
import { cn } from "@/lib/utils";
import { Sid } from "./sid";
import { TapSpot } from "./tap-spot";

interface Highlight {
  box: number[];
  label: string;
  instruction: string;
  frame: Frame | null;
}

type DocPiP = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
const docPiP = () =>
  typeof window !== "undefined" ? ((window as unknown as { documentPictureInPicture?: DocPiP }).documentPictureInPicture ?? null) : null;

export function LivePreflight({
  c,
  onStart,
  onCancel,
}: {
  c: LiveCopy;
  onStart: (source: LiveSource) => void;
  onCancel: () => void;
}) {
  const canScreen = screenShareSupported();
  const [source, setSource] = useState<LiveSource>(canScreen ? "screen" : "camera");
  return (
    <section aria-labelledby="live-pre-title" className="flex flex-col gap-5">
      <div className="flex items-end gap-3">
        <Sid mood="helping" className="size-20" />
        <div className="bubble flex-1 bg-surface p-4 ring-1 ring-line">
          <h1 id="live-pre-title" className="text-2xl leading-tight font-bold text-balance text-ink">
            {c.preTitle}
          </h1>
          <p className="mt-1 text-lg text-ink-soft">{c.preBody}</p>
        </div>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-hand text-lg font-bold text-ink">{c.whatShare}</legend>
        {(
          [
            { id: "screen", icon: Monitor, title: c.screen, sub: c.screenSub, disabled: !canScreen },
            { id: "camera", icon: Camera, title: c.camera, sub: c.cameraSub, disabled: false },
          ] as const
        ).map((o) => (
          <label
            key={o.id}
            className={cn(
              "flex cursor-pointer items-center gap-4 rounded-2xl bg-surface p-4 ring-2 ring-line transition-colors has-checked:bg-sky-bg has-checked:ring-sky has-focus-visible:outline-3 has-focus-visible:outline-sky",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name="live-source"
              value={o.id}
              checked={source === o.id}
              disabled={o.disabled}
              onChange={() => setSource(o.id)}
              className="sr-only"
            />
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-ink text-mark dark:bg-mark dark:text-on-mark">
              <o.icon className="size-6" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-lg font-bold text-ink">{o.title}</span>
              <span className="text-sm text-ink-soft">{o.disabled ? c.screenUnsupported : o.sub}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <ul className="flex flex-col gap-3 rounded-2xl bg-caution-bg p-4 text-ink">
        <li className="flex gap-3">
          <Lock className="mt-0.5 size-5 shrink-0 text-caution" aria-hidden="true" />
          <span className="text-lg">{c.closePasswords}</span>
        </li>
        <li className="flex gap-3">
          <EyeOff className="mt-0.5 size-5 shrink-0 text-caution" aria-hidden="true" />
          <span className="text-lg">{c.noRecording}</span>
        </li>
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onStart(source)}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-mark px-6 text-lg font-bold text-on-mark shadow-[0_0.25rem_0_0_var(--ink)] active:translate-y-1 active:shadow-none"
        >
          <Mic className="size-5" aria-hidden="true" />
          {c.start}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-14 rounded-full px-6 text-lg font-semibold text-ink-soft hover:text-ink"
        >
          {c.useScreenshot}
        </button>
      </div>
    </section>
  );
}

export function LiveView({
  c,
  lang,
  source,
  simple,
  onEnd,
  onFail,
  onAskFamily,
  onCelebrate,
}: {
  c: LiveCopy;
  lang: string;
  source: LiveSource;
  simple: boolean;
  onEnd: () => void;
  onFail: (message: string, frame: Frame | null, lastQuestion: string) => void;
  onAskFamily: (summary: string, frame: Frame | null) => void;
  onCelebrate: () => void;
}) {
  const sidRef = useRef<LiveSid | null>(null);
  const mouthRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "ended">("connecting");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [hl, setHl] = useState<Highlight | null>(null);
  const [sidLine, setSidLine] = useState("");
  const [userLine, setUserLine] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [scam, setScam] = useState<{ reason: string; severity: "scam" | "suspicious" } | null>(null);
  const [steps, setSteps] = useState<{ text: string; done: boolean }[]>([]);
  const [muted, setMuted] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [current, setCurrent] = useState<LiveSource>(source);
  const [switching, setSwitching] = useState(false);
  const [notice, setNotice] = useState("");
  const lastQuestion = useRef("");
  const autoFloat = useRef<(() => void) | null>(null);
  const cb = useRef({ onFail, onAskFamily, onCelebrate, onEnd });
  useEffect(() => {
    cb.current = { onFail, onAskFamily, onCelebrate, onEnd };
  });

  useEffect(() => {
    if (sidRef.current) return;
    const live = new LiveSid({
      source,
      lang,
      onEvent: (e: LiveEvent) => {
        switch (e.type) {
          case "status":
            setStatus(e.status);
            if (e.status === "live" && source === "screen") autoFloat.current?.();
            if (e.status === "ended") cb.current.onEnd();
            break;
          case "source":
            setCurrent(e.source);
            setHl(null);
            setNotice("");
            break;
          case "frame":
            setFrame(e.frame);
            break;
          case "sid-caption":
            setSidLine(e.text);
            break;
          case "user-caption":
            setUserLine(e.text);
            if (e.final) lastQuestion.current = e.text;
            break;
          case "speaking":
            setSpeaking(e.speaking);
            break;
          case "turn-end":
            // Sid answered without pointing at anything: drop the old ring so it can't contradict him
            if (e.spoke && !e.highlighted) setHl(null);
            break;
          case "highlight":
            setHl({ box: e.box, label: e.label, instruction: e.instruction, frame: e.frame });
            if (e.instruction)
              setSteps((s) =>
                s.length && !s[s.length - 1].done && s[s.length - 1].text === e.instruction
                  ? s
                  : [...s.filter((x) => x.done || x.text !== e.instruction), { text: e.instruction, done: false }],
              );
            break;
          case "scam":
            setScam({ reason: e.reason, severity: e.severity });
            break;
          case "step-done":
            setHl(null);
            setSteps((s) => {
              const i = s.findIndex((x) => !x.done);
              if (i === -1) return s;
              const next = [...s];
              next[i] = { ...next[i], done: true };
              return next;
            });
            if (e.allDone) setTimeout(() => cb.current.onCelebrate(), 1200);
            break;
          case "ask-family":
            cb.current.onAskFamily(e.summary, sidRef.current?.latestFrame ?? null);
            break;
          case "error":
            // Non-fatal (e.g. the camera was blocked when switching): keep the session, say what happened
            if (!e.fatal) setNotice(e.message);
            else cb.current.onFail(e.message, e.frame, lastQuestion.current);
            break;
        }
      },
    });
    sidRef.current = live;
    live.start();

    // Animate Sid's mouth with his voice, without re-rendering React
    let raf = 0;
    const tick = () => {
      const l = live.level();
      mouthRef.current?.style.setProperty("--talk", String(0.15 + l * 0.85));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => pip?.close(), [pip]);
  // Stop everything when Live mode is left (unmount). Deferred so a dev double-mount doesn't kill it.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) sidRef.current?.stop(false);
      }, 0);
    };
  }, []);

  async function popOut() {
    const api = docPiP();
    if (!api) return;
    try {
      const w = await api.requestWindow({ width: 400, height: 660 });
      // Bring our styles, fonts, theme and language into the floating window.
      // <base> makes relative font URLs resolve against our origin.
      const base = w.document.createElement("base");
      base.href = location.origin + "/";
      w.document.head.appendChild(base);
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const style = w.document.createElement("style");
          style.textContent = Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join("\n");
          w.document.head.appendChild(style);
        } catch {
          if (sheet.href) {
            const link = w.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            w.document.head.appendChild(link);
          }
        }
      }
      const root = document.documentElement;
      w.document.documentElement.className = root.className;
      w.document.documentElement.lang = root.lang;
      w.document.documentElement.dir = root.dir;
      if (root.dataset.simple) w.document.documentElement.dataset.simple = root.dataset.simple;
      w.document.title = "Sid";
      w.document.body.className = "bg-background text-foreground";
      w.addEventListener("pagehide", () => setPip(null));
      setPip(w);
    } catch {
      /* not allowed: stay in-page */
    }
  }

  useEffect(() => {
    autoFloat.current = () => {
      if (docPiP() && !pip) popOut();
    };
  });

  function stop() {
    sidRef.current?.stop();
  }

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    if (sidRef.current) sidRef.current.muted = m;
  }

  async function switchTo(to: LiveSource) {
    const live = sidRef.current;
    if (!live) return;
    setSwitching(true);
    setNotice("");
    await live.switchSource(to);
    setSwitching(false);
    // Show the failure in the user's language rather than the session's English message
    setNotice((n) => (n ? (to === "camera" ? c.cameraFailed : c.screenFailed) : ""));
  }

  const shown = hl?.frame ?? frame;
  const where = current === "screen" ? c.seesScreen : c.seesCamera;
  const canSwitch = status === "live" && (current === "screen" || screenShareSupported());

  const panel = (
    <div
      className={cn(
        "flex flex-col gap-3",
        pip ? "min-h-dvh p-3" : "lg:grid lg:grid-flow-dense lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-x-8",
      )}
    >
      {/* Always-visible privacy indicator + one-tap stop */}
      <div className="flex items-center gap-2 rounded-full bg-danger-bg py-1.5 ps-4 pe-1.5 text-danger lg:col-span-2" role="status">
        <span className="relative flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
          <span className="relative inline-flex size-3 rounded-full bg-danger" />
        </span>
        <span className="flex-1 font-bold">{status === "connecting" ? c.connecting : where}</span>
        <button
          type="button"
          onClick={stop}
          className="flex h-11 items-center gap-2 rounded-full bg-danger px-4 font-bold text-white"
        >
          <Square className="size-4 fill-current" aria-hidden="true" />
          {c.stop}
        </button>
      </div>

      {/* Sid + live captions */}
      <div className="flex items-start gap-3 lg:col-start-2">
        <div ref={mouthRef} className={cn("shrink-0", speaking && "sid-talking")}>
          <Sid mood={scam ? "worried" : status === "connecting" ? "thinking" : "helping"} className={pip ? "size-16" : "size-20"} />
        </div>
        <div className="bubble min-h-20 flex-1 bg-surface p-3 ring-1 ring-line" aria-live="polite" lang={lang} dir="auto">
          <p className={cn("leading-snug font-bold text-ink", simple || pip ? "text-xl" : "text-2xl")}>
            {sidLine || (status === "connecting" ? c.connecting : c.listening)}
          </p>
          {userLine && (
            <p className="mt-2 text-base text-ink-soft" dir="auto">
              <span className="font-semibold">{c.you}:</span> {userLine}
            </p>
          )}
        </div>
      </div>

      {scam && (
        <div
          role="alert"
          className={cn(
            "pop-in flex items-start gap-3 rounded-2xl p-4 ring-2 lg:col-start-2",
            scam.severity === "scam" ? "bg-danger-bg text-danger ring-danger" : "bg-caution-bg text-caution ring-caution",
          )}
        >
          <ShieldAlert className="size-9 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-2xl leading-tight font-bold">{scam.severity === "scam" ? c.scamTitle : c.suspiciousTitle}</p>
            <p className="mt-1 text-lg text-ink">{scam.reason}</p>
          </div>
          <button
            type="button"
            onClick={() => setScam(null)}
            aria-label={c.dismiss}
            className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {hl?.instruction && (
        <p className={cn("leading-tight font-bold text-ink lg:col-start-2", pip ? "text-2xl" : "text-3xl")} lang={lang} dir="auto">
          <span className="marked">{hl.instruction}</span>
        </p>
      )}

      {shown ? (
        <TapSpot
          key={hl ? `hl-${hl.box.join(",")}` : "live"}
          src={shown.url}
          width={shown.width}
          height={shown.height}
          box={hl?.box}
          label={hl?.label}
          hereText={{ tap: c.tapHere, click: c.clickHere }}
          alt={hl?.instruction || where}
          className={pip ? "[&_.tap-media]:max-h-[38vh]" : "[&_.tap-media]:max-h-[50vh] lg:col-start-1 lg:row-span-6 lg:row-start-2 lg:[&_.tap-media]:max-h-[72vh]"}
        />
      ) : (
        <div className="grid aspect-video place-items-center rounded-[1.25rem] border-4 border-dashed border-line text-ink-soft lg:col-start-1 lg:row-span-6 lg:row-start-2">
          {c.waitingForScreen}
        </div>
      )}

      {steps.length > 0 && (
        <ol className="flex flex-col gap-1.5 lg:col-start-2" aria-label={c.progress}>
          {steps.map((s, i) => (
            <li key={i} className={cn("flex items-center gap-2 text-base", s.done ? "text-ink-soft" : "font-semibold text-ink")} dir="auto">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                  s.done ? "bg-safe text-safe-bg" : "bg-mark text-on-mark ring-1 ring-ink",
                )}
                aria-hidden="true"
              >
                {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn(s.done && "line-through decoration-2")}>{s.text}</span>
              <span className="sr-only">{s.done ? c.done : ""}</span>
            </li>
          ))}
        </ol>
      )}

      {current === "camera" && status === "live" && (
        <p className="flex items-center gap-2 text-lg text-ink-soft lg:col-start-2" dir="auto">
          <Smartphone className="size-5 shrink-0" aria-hidden="true" />
          {c.phoneHint}
        </p>
      )}

      {notice && (
        <p role="alert" className="rounded-2xl bg-caution-bg p-3 text-lg font-semibold text-caution ring-1 ring-caution lg:col-start-2" dir="auto">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-2 lg:col-start-2">
        {canSwitch && (
          <button
            type="button"
            onClick={() => switchTo(current === "screen" ? "camera" : "screen")}
            disabled={switching}
            aria-busy={switching}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface px-5 text-lg font-bold text-ink ring-2 ring-ink disabled:opacity-60"
          >
            {current === "screen" ? (
              <Smartphone className="size-5" aria-hidden="true" />
            ) : (
              <Monitor className="size-5" aria-hidden="true" />
            )}
            {current === "screen" ? c.showPhone : source === "screen" ? c.backToScreen : c.showScreen}
          </button>
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className="flex h-12 items-center gap-2 rounded-full bg-surface px-4 font-semibold text-ink ring-1 ring-line aria-pressed:bg-caution-bg aria-pressed:ring-caution"
        >
          {muted ? <MicOff className="size-5" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}
          {muted ? c.unmute : c.mute}
        </button>
        {!pip && docPiP() && (
          <button
            type="button"
            onClick={popOut}
            className="flex h-12 items-center gap-2 rounded-full bg-ink px-4 font-semibold text-paper"
          >
            <PictureInPicture2 className="size-5" aria-hidden="true" />
            {c.popOut}
          </button>
        )}
        <button
          type="button"
          onClick={() => onAskFamily(lastQuestion.current, sidRef.current?.latestFrame ?? null)}
          className="flex h-12 items-center gap-2 rounded-full bg-surface px-4 font-semibold text-ink ring-1 ring-line"
        >
          <MessageCircleHeart className="size-5" aria-hidden="true" />
          {c.askFamily}
        </button>
      </div>
    </div>
  );

  if (pip) {
    return (
      <>
        {createPortal(panel, pip.document.body)}
        <section className="flex flex-col items-center gap-4 py-10 text-center">
          <Sid mood="helping" className="size-24" />
          <p className="text-2xl font-bold text-ink">{c.inFloating}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => pip.close()} className="h-12 rounded-full bg-surface px-5 font-semibold text-ink ring-1 ring-line">
              {c.bringBack}
            </button>
            <button type="button" onClick={stop} className="h-12 rounded-full bg-danger px-5 font-bold text-white">
              {c.stop}
            </button>
          </div>
        </section>
      </>
    );
  }
  return panel;
}

"use client";

import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { cleanCaption } from "./caption";

export type LiveSource = "screen" | "camera";

export interface Frame {
  url: string; // data: URL (kept in memory only, never uploaded anywhere but Gemini)
  data: string; // base64 jpeg
  width: number;
  height: number;
}

export type LiveEvent =
  | { type: "mic"; listening: boolean }
  | { type: "status"; status: "connecting" | "live" | "ended" }
  | { type: "source"; source: LiveSource }
  /** What kind of screen is shared: "monitor" means the whole screen, so Sid can see himself */
  | { type: "surface"; surface: string }
  | { type: "frame"; frame: Frame }
  | { type: "sid-caption"; text: string; final: boolean }
  | { type: "user-caption"; text: string; final: boolean }
  | { type: "speaking"; speaking: boolean }
  | { type: "turn-end"; highlighted: boolean; spoke: boolean }
  | { type: "highlight"; box: number[]; label: string; instruction: string; frame: Frame | null }
  | { type: "scam"; reason: string; severity: "scam" | "suspicious" }
  | { type: "step-done"; step: string; allDone: boolean }
  | { type: "ask-family"; summary: string }
  | { type: "error"; message: string; frame: Frame | null; fatal: boolean };

const MIC_WORKLET = `
class MicCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0).buffer); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("mic-capture", MicCapture);
`;

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Tell our server why a live connection closed, so drops show up in the logs. */
function reportClose(info: Record<string, unknown>) {
  try {
    navigator.sendBeacon?.("/api/live-log", JSON.stringify(info));
  } catch {}
}

/** Counters exposed for automated tests. */
const debug = { audioChunks: 0, loudChunks: 0, frames: 0, bytes: 0 };
if (typeof window !== "undefined") (window as unknown as { __sidDebug: typeof debug }).__sidDebug = debug;

export const liveSupported = () =>
  typeof window !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof AudioWorkletNode !== "undefined" &&
  typeof WebSocket !== "undefined";

export const screenShareSupported = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent);

export class LiveSid {
  private session: Session | null = null;
  private mic: MediaStream | null = null;
  private video: MediaStream | null = null;
  /** The other stream, kept open so switching back is instant (e.g. the screen while showing the camera). */
  private parked: { source: LiveSource; stream: MediaStream } | null = null;
  private current: LiveSource = "screen";
  private switching = false;
  private inCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private playHead = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private frameTimer: number | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  private thumb = typeof document !== "undefined" ? document.createElement("canvas") : null;
  private lastThumb: Uint8ClampedArray | null = null;
  private changedAt = 0;
  private settledSent = true;
  private changeStartedAt = 0;
  private progressQueued = false;
  private lastProgressCheck = 0;
  private lastInstruction = "";
  private taskStarted = false;
  private modelBusy = false;
  private lastWatch = 0;
  private latest: Frame | null = null;
  private sidText = "";
  /** Seconds of Sid's voice received this turn: captions never run ahead of what was said */
  private turnAudioSec = 0;
  private userText = "";
  private speaking = false;
  private stepPending = false;
  private highlightedThisTurn = false;
  private stopped = false;
  private connected = false;
  private connId = 0;
  private attemptIdx = 0;
  private resumeHandle: string | undefined;
  private resumed = false;
  private reconnecting = false;
  private reconnects = 0;
  /** Frame sending: only on change, at most every 2s, plus a keep-alive and one when the user speaks */
  private lastSent = 0;
  private sentFrame: Frame | null = null;
  private micTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = true;
  private wantFrame = false;
  private sendCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  private connectedAt = Date.now();
  muted = true;

  /** One voice command per click; ambient noise cannot interrupt guidance. */
  setListening(listening: boolean) {
    if (this.micTimer) clearTimeout(this.micTimer);
    this.micTimer = null;
    if (listening) {
      this.flushAudio();
      this.wantFrame = true;
    }
    const wasMuted = this.muted;
    this.muted = !listening;
    this.mic?.getAudioTracks().forEach((track) => { track.enabled = listening; });
    if (!listening && !wasMuted) this.session?.sendRealtimeInput({ audioStreamEnd: true });
    this.opts.onEvent({ type: "mic", listening });
    if (listening) this.micTimer = setTimeout(() => this.setListening(false), 15000);
  }

  constructor(
    private opts: {
      source: LiveSource;
      lang: string;
      onEvent: (e: LiveEvent) => void;
    },
  ) {}

  get latestFrame() {
    return this.latest;
  }

  /** Current output loudness 0..1, for Sid's mouth. */
  level() {
    if (!this.analyser) return 0;
    const d = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(d);
    let sum = 0;
    for (const v of d) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / d.length) * 4);
  }

  /**
   * Must be called synchronously from a user gesture: audio contexts are created
   * before any await so the browser lets them play and record.
   */
  async start() {
    const emit = this.opts.onEvent;
    emit({ type: "status", status: "connecting" });
    this.outCtx = new AudioContext({ sampleRate: 24000 });
    this.inCtx = new AudioContext({ sampleRate: 16000 });
    const resumed = Promise.all([this.outCtx.resume(), this.inCtx.resume()]).catch(() => {});
    try {
      // 1. Media first, while we still have the user's click
      this.video =
        this.opts.source === "screen"
          ? await this.screenStream()
          : await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      this.current = this.opts.source;
      this.watchEnded(this.video, this.opts.source);
      if (this.opts.source === "screen") this.reportSurface(this.video);
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      this.mic.getAudioTracks().forEach((track) => { track.enabled = false; });

      await resumed;
      this.analyser = this.outCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.outCtx.destination);

      // 2. Live session via a short-lived token from our server
      await this.connect(0);
      if (this.stopped) return;

      // 3. Stream mic audio
      const url = URL.createObjectURL(new Blob([MIC_WORKLET], { type: "application/javascript" }));
      await this.inCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const src = this.inCtx.createMediaStreamSource(this.mic);
      const node = new AudioWorkletNode(this.inCtx, "mic-capture");
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (!this.session || this.muted || this.stopped) return;
        debug.audioChunks++;
        const pcm = new Int16Array(e.data);
        let peak = 0;
        for (let i = 0; i < pcm.length; i += 8) peak = Math.max(peak, Math.abs(pcm[i]));
        if (peak > 1500) {
          debug.loudChunks++;
          this.wantFrame = true; // the user is talking: make sure Sid has a current picture
        }
        this.session.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } });
      };
      src.connect(node);

      // 4. Stream ~1 frame per second
      this.videoEl = document.createElement("video");
      this.videoEl.muted = true;
      this.videoEl.playsInline = true;
      this.videoEl.srcObject = this.video;
      await this.videoEl.play();
      this.sendFrame(true);
      this.frameTimer = window.setInterval(() => this.sendFrame(false), 1000);

      // Let Sid look first (after a couple of frames): greet, or warn straight away if a scam is already on screen
      await new Promise((r) => setTimeout(r, 1300));
      if (this.stopped) return;
      this.session?.sendRealtimeInput({
        text: "[The user just started live help and is sharing their " + (this.opts.source === "screen" ? "screen" : "camera") + ". Look at it. If you see a scam, call scam_alert and warn them. Otherwise just greet them in one short sentence and ask what they need. Do not guess their task or give any steps yet.]",
      });
      emit({ type: "status", status: "live" });
      // Automated tests can type to Sid (localhost only)
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        const w = window as unknown as { __sidSay: (t: string) => void; __sidDrop: () => void };
        w.__sidSay = (t) => this.say(t);
        w.__sidDrop = () => this.session?.close(); // simulate a dropped connection
      }
    } catch (err) {
      const e = err as Error;
      const denied = e?.name === "NotAllowedError";
      emit({
        type: "error",
        fatal: true,
        frame: this.latest,
        message: denied
          ? this.opts.source === "screen"
            ? "Screen sharing or the microphone was blocked."
            : "The camera or microphone was blocked."
          : "Live help couldn't start.",
      });
      this.stop(false);
    }
  }

  /** Screen share. `?testScreen=/path.jpg` (localhost only) shares a still image, for automated tests. */
  private async screenStream(): Promise<MediaStream> {
    const test = new URLSearchParams(location.search).get("testScreen");
    if (test && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && test.startsWith("/")) {
      const img = new Image();
      img.src = test;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const draw = () => c.getContext("2d")!.drawImage(img, 0, 0);
      draw();
      setInterval(draw, 500);
      return c.captureStream(2);
    }
    // Steer people to one window or tab (no hall-of-mirrors), and never offer Sid's own tab
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 5, displaySurface: "window" },
      audio: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      preferCurrentTab: false,
    } as DisplayMediaStreamOptions);
  }

  private reportSurface(stream: MediaStream) {
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const test = local ? new URLSearchParams(location.search).get("testSurface") : null;
    const surface = test || (stream.getVideoTracks()[0]?.getSettings() as { displaySurface?: string }).displaySurface || "";
    if (surface) this.opts.onEvent({ type: "surface", surface });
  }

  private async connect(attempt: number, handle?: string, allowFallback = true): Promise<void> {
    const res = await fetch("/api/live-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang: this.opts.lang, attempt, handle }),
    });
    const body = await res.json();
    if (!res.ok || !body.token) throw new Error(body.message || "token");
    const ai = new GoogleGenAI({ apiKey: body.token, apiVersion: "v1alpha" });

    const id = ++this.connId;
    await new Promise<void>((resolve, reject) => {
      let opened = false;
      ai.live
        .connect({
          model: body.model,
          config: { responseModalities: [Modality.AUDIO] },
          callbacks: {
            onmessage: (m) => {
              if (m.goAway) console.warn("[sid live] goAway", JSON.stringify(m.goAway));
              if (m.setupComplete && !opened) {
                opened = true;
                this.connectedAt = Date.now();
                this.connected = true;
                this.attemptIdx = body.attempt ?? attempt;
                this.resumed = !!handle;
                resolve();
              }
              this.onMessage(m);
            },
            onerror: () => {
              if (!opened) reject(new Error("socket"));
            },
            onclose: (e) => {
              const info = { code: e.code, reason: e.reason || "", afterSec: Math.round((Date.now() - this.connectedAt) / 1000), model: body.model };
              console.warn("[sid live] closed", JSON.stringify(info));
              reportClose(info);
              if (!opened) {
                reject(new Error(e.reason || "closed"));
                return;
              }
              // A dropped connection (time limit, rate limit, network): reconnect quietly
              if (!this.stopped && id === this.connId) void this.reconnect();
            },
          },
        })
        .then((s) => {
          this.session = s;
        })
        .catch(reject);
      setTimeout(() => !opened && reject(new Error("timeout")), 10_000);
    }).catch(async (err) => {
      this.session?.close();
      this.session = null;
      // A resume handle only works on the same model, so fallbacks start a fresh session
      if (allowFallback && body.hasFallback && !this.stopped) return this.connect((body.attempt ?? attempt) + 1);
      throw err;
    });
  }

  private onMessage(m: LiveServerMessage) {
    const emit = this.opts.onEvent;
    const ru = m.sessionResumptionUpdate;
    if (ru?.resumable && ru.newHandle) this.resumeHandle = ru.newHandle;
    const sc = m.serverContent;
    if (sc?.interrupted) this.flushAudio();
    for (const p of sc?.modelTurn?.parts ?? []) {
      if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("audio/")) this.play(p.inlineData.data);
    }
    if (sc?.outputTranscription?.text) {
      this.sidText += sc.outputTranscription.text;
      const shown = cleanCaption(this.sidText, this.turnAudioSec);
      if (shown) emit({ type: "sid-caption", text: shown, final: false });
    }
    if (sc?.inputTranscription?.text) {
      this.taskStarted = true;
      this.userText += sc.inputTranscription.text;
      emit({ type: "user-caption", text: this.userText.trim(), final: false });
    }
    if (sc?.turnComplete || sc?.interrupted) {
      this.modelBusy = false;
      const spoke = this.turnAudioSec > 0;
      if (spoke && this.taskStarted && this.sidText.trim()) {
        this.stepPending = true;
        this.lastInstruction = this.sidText.trim();
      }
      emit({ type: "turn-end", highlighted: this.highlightedThisTurn, spoke });
      this.highlightedThisTurn = false;
      // Text with no voice behind it was never said aloud: don't show it
      const shown = spoke ? cleanCaption(this.sidText, this.turnAudioSec) : "";
      if (shown) emit({ type: "sid-caption", text: shown, final: true });
      this.turnAudioSec = 0;
      if (this.userText) emit({ type: "user-caption", text: this.userText.trim(), final: true });
      this.sidText = "";
      this.userText = "";
    }

    if (m.toolCall?.functionCalls?.length) {
      for (const f of m.toolCall.functionCalls) {
        const a = (f.args ?? {}) as Record<string, unknown>;
        if (f.name === "highlight") {
          this.stepPending = true;
          this.lastInstruction = String(a.instruction ?? "");
          this.highlightedThisTurn = true;
          emit({
            type: "highlight",
            box: Array.isArray(a.box_2d) ? (a.box_2d as number[]) : [],
            label: String(a.label ?? ""),
            instruction: String(a.instruction ?? ""),
            frame: this.sentFrame,
          });
        } else if (f.name === "scam_alert") {
          emit({ type: "scam", reason: String(a.reason ?? ""), severity: a.severity === "suspicious" ? "suspicious" : "scam" });
        } else if (f.name === "step_done") {
          this.stepPending = !a.all_done;
          if (a.all_done) this.taskStarted = false;
          emit({ type: "step-done", step: String(a.step ?? ""), allDone: !!a.all_done });
        } else if (f.name === "ask_family") {
          emit({ type: "ask-family", summary: String(a.summary ?? "") });
        }
      }
      this.session?.sendToolResponse({
        functionResponses: m.toolCall.functionCalls.map((f) => ({
          id: f.id,
          name: f.name,
          response: { result: "shown on the user's screen" },
        })),
      });
    }
  }

  private play(b64: string) {
    if (!this.muted) this.setListening(false);
    if (!this.outCtx || !this.analyser) return;
    const pcm = new Int16Array(fromBase64(b64));
    this.turnAudioSec += pcm.length / 24000;
    const buf = this.outCtx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    const t = Math.max(this.outCtx.currentTime + 0.02, this.playHead);
    src.start(t);
    this.playHead = t + buf.duration;
    this.sources.add(src);
    if (!this.speaking) {
      this.speaking = true;
      this.opts.onEvent({ type: "speaking", speaking: true });
    }
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0 && this.speaking) {
        this.speaking = false;
        this.opts.onEvent({ type: "speaking", speaking: false });
      }
    };
  }

  /** The user talked over Sid: stop speaking immediately. */
  private flushAudio() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.playHead = 0;
    if (this.speaking) {
      this.speaking = false;
      this.opts.onEvent({ type: "speaking", speaking: false });
    }
  }

  private sendFrame(force: boolean) {
    const v = this.videoEl;
    if (!v || !this.canvas || !this.thumb || !this.sendCanvas || !v.videoWidth || this.stopped) return;
    // On-page preview: up to 1280px
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);

    // More detail and all colour channels preserve small menu changes.
    this.thumb.width = 96;
    this.thumb.height = 96;
    const tctx = this.thumb.getContext("2d", { willReadFrequently: true })!;
    tctx.drawImage(this.canvas, 0, 0, 96, 96);
    const px = tctx.getImageData(0, 0, 96, 96).data;
    let changedPixels = 0;
    if (this.lastThumb) for (let i = 0; i < px.length; i += 4) {
      const diff = Math.abs(px[i] - this.lastThumb[i]) + Math.abs(px[i + 1] - this.lastThumb[i + 1]) + Math.abs(px[i + 2] - this.lastThumb[i + 2]);
      if (diff > 60) changedPixels++;
    }
    const changed = !this.lastThumb || changedPixels >= 12;
    this.lastThumb = px;
    if (changed) this.dirty = true;

    const url = this.canvas.toDataURL("image/jpeg", 0.72);
    const frame: Frame = { url, data: url.split(",")[1], width: w, height: h };
    this.latest = frame;
    this.opts.onEvent({ type: "frame", frame });

    // To Gemini: only when the screen changed (or the user just spoke, or a 12s keep-alive so
    // Sid doesn't forget the screen), at most one frame every 2s, max 768px, compressed.
    // Streaming every frame at full size ran into the Live API's token-per-minute limit.
    const now = Date.now();
    const since = now - this.lastSent;
    if (this.session && since >= 2000 && (force || this.dirty || this.wantFrame || since >= 12_000)) {
      const s2 = Math.min(1, 768 / Math.max(w, h));
      this.sendCanvas.width = Math.round(w * s2);
      this.sendCanvas.height = Math.round(h * s2);
      this.sendCanvas.getContext("2d")?.drawImage(this.canvas, 0, 0, this.sendCanvas.width, this.sendCanvas.height);
      const small = this.sendCanvas.toDataURL("image/jpeg", 0.6).split(",")[1];
      this.session.sendRealtimeInput({ video: { data: small, mimeType: "image/jpeg" } });
      this.sentFrame = { ...frame, url: `data:image/jpeg;base64,${small}`, data: small, width: this.sendCanvas.width, height: this.sendCanvas.height };
      this.lastSent = now;
      this.dirty = false;
      this.wantFrame = false;
      debug.frames++;
      debug.bytes += small.length;
    }

    if (changed) {
      if (this.settledSent) this.changeStartedAt = now;
      this.changedAt = now;
      this.settledSent = false;
    }
    if (!this.settledSent && (now - this.changedAt > 1200 || now - this.changeStartedAt >= 4000)) {
      // A playing video must not postpone checks forever.
      this.settledSent = true;
      this.progressQueued = true;
      void this.onSettled(frame);
    }
    // Keep a deferred check while Sid speaks. Periodic checks also catch subtle changes.
    if (this.modelBusy && now - this.lastProgressCheck >= 20000) this.modelBusy = false;
    if (this.stepPending && this.muted && !this.speaking && !this.modelBusy &&
        now - this.lastProgressCheck >= 8000 &&
        (this.progressQueued || now - this.lastProgressCheck >= 12000) && this.session) {
      // Send the exact current picture before asking the model to inspect it.
      this.session.sendRealtimeInput({ video: { data: frame.data, mimeType: "image/jpeg" } });
      this.sentFrame = frame;
      this.session.sendClientContent({ turns: [{ role: "user", parts: [{ text:
        `[Automatic screen progress check. Previous instruction: ${this.lastInstruction.slice(0, 700)}. Inspect the attached latest screen. If it visibly shows the expected result, call step_done and give the next single step with highlight. An already-open menu must not be opened again. Video motion alone is not progress. If unchanged or uncertain, stay silent; do not repeat the instruction or ask the user to say done.]`,
      }] }], turnComplete: true });
      this.modelBusy = true;
      this.progressQueued = false;
      this.lastProgressCheck = now;
      this.lastSent = now;
    }
  }

  private async onSettled(frame: Frame) {
    if (this.stopped || !this.session) return;
    if (Date.now() - this.lastWatch < 4000) return;
    this.lastWatch = Date.now();
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: frame.data }),
      });
      const v = await res.json();
      if (v?.scam && !this.stopped) {
        this.opts.onEvent({ type: "scam", reason: v.reason, severity: v.severity === "suspicious" ? "suspicious" : "scam" });
        this.session?.sendRealtimeInput({
          text: `[Warning: the screen now shows what looks like a scam (${v.reason}). Warn the user right now, calmly, in their language: tell them not to click, call or pay anything, and how to close it safely.]`,
        });
      }
    } catch {}
  }

  /** If the user ends a share from the browser's own bar, stop (or fall back to the other source). */
  private watchEnded(stream: MediaStream, source: LiveSource) {
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (this.stopped || this.switching) return;
      if (this.current !== source) {
        if (this.parked?.stream === stream) this.parked = null;
        return;
      }
      if (this.parked) void this.switchSource(this.parked.source);
      else this.stop();
    });
  }

  private cameraStream() {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  }

  get source() {
    return this.current;
  }

  /**
   * Swap what Sid sees, in the same session: screen share <-> camera (e.g. "Show Sid your phone").
   * Call from a click. The screen share stays open in the background so going back is instant;
   * the camera is turned off whenever it isn't being shown.
   */
  async switchSource(to: LiveSource) {
    if (this.stopped || this.switching || to === this.current || !this.videoEl) return;
    this.switching = true;
    const from = this.current;
    try {
      const next =
        this.parked?.source === to && this.parked.stream.getVideoTracks()[0]?.readyState === "live"
          ? this.parked.stream
          : to === "camera"
            ? await this.cameraStream()
            : await this.screenStream();
      if (this.stopped) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      if (next !== this.parked?.stream) this.watchEnded(next, to);
      const prev = this.video;
      // Keep the screen share alive for later; never leave the camera on in the background
      if (prev && from === "screen") this.parked = { source: "screen", stream: prev };
      else {
        prev?.getTracks().forEach((t) => t.stop());
        this.parked = null;
      }
      if (this.parked?.stream === next) this.parked = null;
      this.video = next;
      this.current = to;
      this.videoEl.srcObject = next;
      await this.videoEl.play().catch(() => {});
      this.lastThumb = null;
      this.progressQueued = false;
      this.settledSent = true;
      this.flushAudio();
      this.opts.onEvent({ type: "source", source: to });
      if (to === "screen") this.reportSurface(next);
      // Give the new picture a moment to arrive before Sid looks
      await new Promise((r) => setTimeout(r, 900));
      if (this.stopped) return;
      this.sendFrame(true);
      this.session?.sendRealtimeInput({
        text:
          to === "camera"
            ? "[The user switched the video to their laptop camera to show you something, usually their phone. From now on the frames are a camera view, not their computer screen. Highlight boxes refer to the camera picture. Do not guess their task from what is on the phone and do not give a step yet: if they already asked something, keep helping with that; otherwise say in one short sentence that you can see it and ask what they need.]"
            : "[The user switched back to sharing their computer screen. The frames are their screen again. Keep helping with what they already asked, one short step at a time. Do not start a new task based on what is on the screen; if they have not asked anything, just ask what they need.]",
      });
    } catch (err) {
      const denied = (err as Error)?.name === "NotAllowedError";
      this.opts.onEvent({
        type: "error",
        fatal: false,
        frame: this.latest,
        message: denied
          ? to === "camera"
            ? "The camera was blocked. Allow it in the address bar to show Sid your phone."
            : "Screen sharing was blocked."
          : to === "camera"
            ? "Sid couldn't find a camera on this computer."
            : "Screen sharing couldn't start.",
      });
    } finally {
      this.switching = false;
    }
  }

  /**
   * Silent auto-reconnect. Uses the latest session-resumption handle so Sid keeps the
   * conversation; if resuming fails, starts fresh and tells Sid not to greet again.
   */
  private async reconnect() {
    if (this.reconnecting || this.stopped) return;
    this.reconnecting = true;
    this.session = null;
    this.connected = false;
    this.modelBusy = false;
    this.flushAudio();
    // Resume on the same model first (Google may need a moment to release the old connection:
    // "session is already connected to an existing client"), then fall back to a fresh session.
    for (let i = 0; i < 5 && !this.stopped && this.reconnects < 25; i++) {
      const resume = i < 3 && !!this.resumeHandle;
      try {
        await this.connect(this.attemptIdx, resume ? this.resumeHandle : undefined, !resume);
        this.reconnects++;
        console.warn(`[sid live] reconnected (${this.resumed ? "resumed" : "fresh session"})`);
        if (!this.resumed) {
          (this.session as Session | null)?.sendRealtimeInput({
            text: "[The connection dropped for a moment and you lost the conversation so far. Do not greet again. Look at the screen and, in one short sentence, ask the user where they got to.]",
          });
        }
        this.lastSent = 0;
        this.sendFrame(true);
        this.reconnecting = false;
        return;
      } catch (err) {
        console.warn("[sid live] reconnect failed", String(err).slice(0, 120));
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    this.reconnecting = false;
    if (this.stopped) return;
    this.opts.onEvent({ type: "error", fatal: true, frame: this.latest, message: "The live connection ended." });
    this.stop(false);
  }

  /** Send a typed message (for accessibility, or when the mic is muted). */
  say(text: string) {
    if (text.trim()) this.taskStarted = true;
    this.session?.sendRealtimeInput({ text });
  }

  stop(emitEnded = true) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.micTimer) clearTimeout(this.micTimer);
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.flushAudio();
    try {
      this.session?.close();
    } catch {}
    this.session = null;
    this.video?.getTracks().forEach((t) => t.stop());
    this.parked?.stream.getTracks().forEach((t) => t.stop());
    this.parked = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.inCtx?.close().catch(() => {});
    this.outCtx?.close().catch(() => {});
    if (this.videoEl) this.videoEl.srcObject = null;
    if (emitEnded) this.opts.onEvent({ type: "status", status: "ended" });
  }
}

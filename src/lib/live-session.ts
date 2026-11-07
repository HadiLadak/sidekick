"use client";

import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";

export type LiveSource = "screen" | "camera";

export interface Frame {
  url: string; // data: URL (kept in memory only, never uploaded anywhere but Gemini)
  data: string; // base64 jpeg
  width: number;
  height: number;
}

export type LiveEvent =
  | { type: "status"; status: "connecting" | "live" | "ended" }
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

/** Counters exposed for automated tests. */
const debug = { audioChunks: 0, loudChunks: 0, frames: 0 };
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
  private lastWatch = 0;
  private latest: Frame | null = null;
  private sidText = "";
  private userText = "";
  private speaking = false;
  private stepPending = false;
  private highlightedThisTurn = false;
  private stopped = false;
  private connected = false;
  muted = false;

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
      this.video.getVideoTracks()[0]?.addEventListener("ended", () => this.stop());
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });

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
        if (peak > 1500) debug.loudChunks++;
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
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  }

  private async connect(attempt: number): Promise<void> {
    const res = await fetch("/api/live-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang: this.opts.lang, attempt }),
    });
    const body = await res.json();
    if (!res.ok || !body.token) throw new Error(body.message || "token");
    const ai = new GoogleGenAI({ apiKey: body.token, apiVersion: "v1alpha" });

    await new Promise<void>((resolve, reject) => {
      let opened = false;
      ai.live
        .connect({
          model: body.model,
          config: { responseModalities: [Modality.AUDIO] },
          callbacks: {
            onmessage: (m) => {
              if (m.setupComplete && !opened) {
                opened = true;
                this.connected = true;
                resolve();
              }
              this.onMessage(m);
            },
            onerror: () => {
              if (!opened) reject(new Error("socket"));
            },
            onclose: (e) => {
              if (!opened) {
                reject(new Error(e.reason || "closed"));
                return;
              }
              if (!this.stopped) {
                this.opts.onEvent({
                  type: "error",
                  fatal: true,
                  frame: this.latest,
                  message: "The live connection ended.",
                });
                this.stop(false);
              }
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
      if (body.hasFallback && !this.stopped) return this.connect(attempt + 1);
      throw err;
    });
  }

  private onMessage(m: LiveServerMessage) {
    const emit = this.opts.onEvent;
    const sc = m.serverContent;
    if (sc?.interrupted) this.flushAudio();
    for (const p of sc?.modelTurn?.parts ?? []) {
      if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("audio/")) this.play(p.inlineData.data);
    }
    if (sc?.outputTranscription?.text) {
      this.sidText += sc.outputTranscription.text;
      emit({ type: "sid-caption", text: this.sidText.trim(), final: false });
    }
    if (sc?.inputTranscription?.text) {
      this.userText += sc.inputTranscription.text;
      emit({ type: "user-caption", text: this.userText.trim(), final: false });
    }
    if (sc?.turnComplete || sc?.interrupted) {
      emit({ type: "turn-end", highlighted: this.highlightedThisTurn, spoke: !!this.sidText.trim() });
      this.highlightedThisTurn = false;
      if (this.sidText) emit({ type: "sid-caption", text: this.sidText.trim(), final: true });
      if (this.userText) emit({ type: "user-caption", text: this.userText.trim(), final: true });
      this.sidText = "";
      this.userText = "";
    }

    if (m.toolCall?.functionCalls?.length) {
      for (const f of m.toolCall.functionCalls) {
        const a = (f.args ?? {}) as Record<string, unknown>;
        if (f.name === "highlight") {
          this.stepPending = true;
          this.highlightedThisTurn = true;
          emit({
            type: "highlight",
            box: Array.isArray(a.box_2d) ? (a.box_2d as number[]) : [],
            label: String(a.label ?? ""),
            instruction: String(a.instruction ?? ""),
            frame: this.latest,
          });
        } else if (f.name === "scam_alert") {
          emit({ type: "scam", reason: String(a.reason ?? ""), severity: a.severity === "suspicious" ? "suspicious" : "scam" });
        } else if (f.name === "step_done") {
          this.stepPending = !a.all_done;
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
    if (!this.outCtx || !this.analyser) return;
    const pcm = new Int16Array(fromBase64(b64));
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
    if (!v || !this.canvas || !this.thumb || !v.videoWidth || this.stopped) return;
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);

    // Cheap change detection on a 24x24 thumbnail
    this.thumb.width = 24;
    this.thumb.height = 24;
    const tctx = this.thumb.getContext("2d", { willReadFrequently: true })!;
    tctx.drawImage(this.canvas, 0, 0, 24, 24);
    const px = tctx.getImageData(0, 0, 24, 24).data;
    let diff = 0;
    if (this.lastThumb) for (let i = 0; i < px.length; i += 4) diff += Math.abs(px[i] - this.lastThumb[i]);
    const changed = !this.lastThumb || diff / 576 > 6;
    this.lastThumb = px;

    const url = this.canvas.toDataURL("image/jpeg", 0.72);
    const frame: Frame = { url, data: url.split(",")[1], width: w, height: h };
    this.latest = frame;
    this.opts.onEvent({ type: "frame", frame });
    // Steady ~1 fps: the Live model treats frames as a video stream and forgets stale ones.
    this.session?.sendRealtimeInput({ video: { data: frame.data, mimeType: "image/jpeg" } });
    debug.frames++;
    void force;

    const now = Date.now();
    if (changed) {
      this.changedAt = now;
      this.settledSent = false;
    } else if (!this.settledSent && now - this.changedAt > 1200) {
      // The screen changed and has now settled: let Sid react like a person would
      this.settledSent = true;
      this.onSettled(frame);
    }
  }

  private async onSettled(frame: Frame) {
    if (this.stopped || !this.session) return;
    if (this.stepPending && !this.speaking) {
      this.session.sendRealtimeInput({
        text: "[The screen just changed. If the user finished the step you gave, call step_done and give the next single step with highlight. If not, stay quiet.]",
      });
    }
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

  /** Send a typed message (for accessibility, or when the mic is muted). */
  say(text: string) {
    this.session?.sendRealtimeInput({ text });
  }

  stop(emitEnded = true) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.flushAudio();
    try {
      this.session?.close();
    } catch {}
    this.session = null;
    this.video?.getTracks().forEach((t) => t.stop());
    this.mic?.getTracks().forEach((t) => t.stop());
    this.inCtx?.close().catch(() => {});
    this.outCtx?.close().catch(() => {});
    if (this.videoEl) this.videoEl.srcObject = null;
    if (emitEnded) this.opts.onEvent({ type: "status", status: "ended" });
  }
}

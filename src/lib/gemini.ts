import { Type } from "@google/genai";
import { apiKeys, clientFor, isOverloadError, isQuotaError, isTimeoutError, markQuotaExceeded } from "./keys";
import type { SidRequest, SidResult } from "./types";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
/** Newest fast Flash first; fall back when a model is overloaded or unavailable. */
const MODELS = [MODEL, "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"].filter((m, i, a) => a.indexOf(m) === i);

export class SidFailure extends Error {
  constructor(
    public kind: "quota" | "timeout" | "overloaded" | "failed",
    cause: unknown,
  ) {
    super(String((cause as { message?: string })?.message ?? cause));
  }
}

const stringArray = { type: Type.ARRAY, items: { type: Type.STRING } };

export const responseSchema = {
  type: Type.OBJECT,
  properties: {
    mode: {
      type: Type.STRING,
      enum: ["show_me", "fix_it", "scam_check", "explain_it"],
      description:
        "show_me = user wants to know how to do something; fix_it = something is broken or shows an error; scam_check = a message, pop-up, email, call or link that might be a scam; explain_it = a general tech question.",
    },
    language: {
      type: Type.STRING,
      description: "BCP-47 code of the language you answered in (en, fr, ur, ar, es, zh, pa, hi...).",
    },
    title: { type: Type.STRING, description: "3-7 word headline of the situation." },
    summary: { type: Type.STRING, description: "1-2 short, warm sentences, plain words." },
    sensitive_info_visible: {
      type: Type.BOOLEAN,
      description: "True if the screenshot shows a password, PIN, one-time code, full card number, SIN or bank login.",
    },
    steps: {
      type: Type.ARRAY,
      description:
        "Ordered steps. Step 1 is the very next action on the CURRENT screenshot. Max 6 steps.",
      items: {
        type: Type.OBJECT,
        properties: {
          instruction: { type: Type.STRING, description: "One action, under 12 words." },
          detail: { type: Type.STRING, description: "Optional extra help in one sentence, or empty." },
          target_label: { type: Type.STRING, description: "Text on or name of the thing to tap, or empty." },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description:
              "[ymin, xmin, ymax, xmax] normalized 0-1000 around the exact element to tap in the screenshot. Empty array if the element is not visible or there is no screenshot.",
          },
        },
        required: ["instruction", "detail", "target_label", "box_2d"],
        propertyOrdering: ["instruction", "detail", "target_label", "box_2d"],
      },
    },
    fix: {
      type: Type.OBJECT,
      properties: {
        what_went_wrong: { type: Type.STRING },
        likely_cause: { type: Type.STRING },
      },
      required: ["what_went_wrong", "likely_cause"],
    },
    scam: {
      type: Type.OBJECT,
      properties: {
        verdict: { type: Type.STRING, enum: ["scam", "suspicious", "looks_safe", "none"], description: "none when mode is not scam_check" },
        reasons: stringArray,
        do_not: stringArray,
        how_to_close: stringArray,
      },
      required: ["verdict", "reasons", "do_not", "how_to_close"],
    },
    explain: {
      type: Type.OBJECT,
      properties: { answer: { type: Type.STRING }, key_points: stringArray },
      required: ["answer", "key_points"],
    },
    done: {
      type: Type.BOOLEAN,
      description: "True only if this is a follow-up and the screenshot shows the problem is now solved.",
    },
    next_hint: {
      type: Type.STRING,
      description: "What to send next, e.g. 'After you tap Wi-Fi, send me a new screenshot.' Empty if nothing is needed.",
    },
  },
  required: [
    "mode", "language", "title", "summary", "sensitive_info_visible", "steps",
    "fix", "scam", "explain", "done", "next_hint",
  ],
  propertyOrdering: [
    "mode", "language", "title", "summary", "sensitive_info_visible", "steps",
    "fix", "scam", "explain", "done", "next_hint",
  ],
};

const SYSTEM = `You are Sid, a warm, patient tech sidekick for people who find phones and computers confusing (often older parents). You see the user's screenshot and/or read their message, pick ONE mode, and help.

Voice: short sentences, everyday words, no jargon (or explain it in brackets), never condescending. Be specific to what is on the screen: name buttons exactly as they appear.

Language: answer in the language the user wrote or spoke in. If they gave no text, use the UI language provided. Urdu must be in Urdu script, Arabic in Arabic script.

Modes and what to fill (fill unused sections with empty strings/arrays):
- show_me: steps (step 1 = what to tap on THIS screen, with box_2d).
- fix_it: fix.what_went_wrong, fix.likely_cause, then steps to fix it.
- scam_check: scam.verdict, scam.reasons (concrete clues you see: sender, link domain, urgency, typos, payment requests), scam.do_not, scam.how_to_close (safe ways to close or delete it, step 1 is the safe button to tap with box_2d in steps if visible). In Canada, CRA, Canada Post, Interac e-Transfer, banks and Service Canada never ask for payment or personal info by text with a link. Look-alike domains are scams. If it is a genuine message, say looks_safe and explain why.
- explain_it: explain.answer and explain.key_points.

box_2d: [ymin, xmin, ymax, xmax] normalized to 0-1000 over the whole screenshot. Draw it tightly around the single element the user should tap for step 1 only. Leave box_2d empty for later steps whose element is not on this screenshot, and empty everywhere when there is no screenshot.

Safety: never ask for passwords, PINs, codes or card numbers. If the screenshot shows any of these, set sensitive_info_visible = true. Never tell the user to call a phone number, click a link or pay anything shown in a suspicious message. For anything involving money that may be a scam, tell them to contact their bank using the number on the back of their card.

Follow-ups: if history is provided, the user did the previous step and sent a new screenshot. Continue from where they are now. If the screenshot shows the goal is reached, set done = true and celebrate briefly in summary. Always set next_hint when a new screenshot after the step would help.`;

export const hasKey = () => apiKeys().length > 0;

export async function askSid(req: SidRequest): Promise<SidResult> {
  const parts: Array<Record<string, unknown>> = [];
  if (req.image) parts.push({ inlineData: { data: req.image.data, mimeType: req.image.mimeType } });

  const history = req.history.length
    ? `Earlier in this conversation:\n${req.history
        .map((t, i) => `${i + 1}. User: ${t.question || "(screenshot)"} → Sid (${t.mode}): ${t.told_user}`)
        .join("\n")}\n\nThe user has now done that and sent the attached screenshot.`
    : "";

  parts.push({
    text: [
      `UI language: ${req.uiLanguage}`,
      history,
      req.image ? "A screenshot is attached." : "No screenshot.",
      `User message: ${req.text.trim() || "(no text, just the screenshot: work out what they need help with)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  // Hedged fallback: start the best model; if it fails, or hasn't answered after a few
  // seconds (busy models can hang), start the next one too and take whichever answers first.
  const hedgeMs = req.image ? 9_000 : 6_000;
  const deadline = AbortSignal.timeout(55_000); // stay under Vercel's 60s limit
  const errors: unknown[] = [];
  const ctrls: AbortController[] = [];
  return new Promise<SidResult>((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      done = true;
      clearTimeout(hedge);
      ctrls.forEach((c) => c.abort());
    };
    const launch = () => {
      clearTimeout(hedge);
      if (done || next >= MODELS.length || deadline.aborted) return;
      const model = MODELS[next++];
      running++;
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      hedge = setTimeout(launch, hedgeMs);
      tryModel(model, parts, AbortSignal.any([ctrl.signal, deadline])).then(
        (r) => {
          if (done) return;
          finish();
          resolve({ ...r, model });
        },
        (err) => {
          running--;
          if (done) return;
          errors.push(err);
          if (next < MODELS.length && !deadline.aborted) launch();
          else if (running === 0) {
            finish();
            const kind = errors.every(isQuotaError)
              ? "quota"
              : errors.some(isTimeoutError)
                ? "timeout"
                : errors.some(isOverloadError)
                  ? "overloaded"
                  : "failed";
            reject(new SidFailure(kind, errors[errors.length - 1]));
          }
        },
      );
    };
    launch();
  });
}

/** One model, trying the second key if the first is out of quota. */
async function tryModel(model: string, parts: Array<Record<string, unknown>>, signal: AbortSignal): Promise<SidResult> {
  let lastErr: unknown = new Error("No API key");
  for (const { index, key } of apiKeys()) {
    try {
      const res = await clientFor(key).models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.3,
          abortSignal: signal,
        },
      });
      const text = res.text;
      if (!text) throw new Error("Empty response");
      return normalize(JSON.parse(text));
    } catch (err) {
      lastErr = err;
      if (!signal.aborted || isTimeoutError(err)) console.warn(`[sid] ${model} (key ${index + 1}) failed:`, String(err).slice(0, 160));
      if (isQuotaError(err)) {
        markQuotaExceeded(index);
        continue; // the other key may still have quota
      }
      throw err;
    }
  }
  throw lastErr;
}

/** Defensive clean-up so the UI never crashes on a slightly-off response. */
export function normalize(r: Partial<SidResult>): SidResult {
  const steps = Array.isArray(r.steps) ? r.steps : [];
  return {
    mode: r.mode ?? "explain_it",
    language: r.language || "en",
    title: r.title ?? "",
    summary: r.summary ?? "",
    sensitive_info_visible: !!r.sensitive_info_visible,
    steps: steps.slice(0, 6).map((s) => ({
      instruction: s.instruction ?? "",
      detail: s.detail ?? "",
      target_label: s.target_label ?? "",
      box_2d:
        Array.isArray(s.box_2d) && s.box_2d.length === 4 && s.box_2d.every((n) => Number.isFinite(n))
          ? s.box_2d.map((n) => Math.max(0, Math.min(1000, Math.round(n))))
          : [],
    })),
    fix: { what_went_wrong: r.fix?.what_went_wrong ?? "", likely_cause: r.fix?.likely_cause ?? "" },
    scam: {
      verdict: (["scam", "suspicious", "looks_safe"] as const).find((v) => v === r.scam?.verdict) ?? "",
      reasons: r.scam?.reasons ?? [],
      do_not: r.scam?.do_not ?? [],
      how_to_close: r.scam?.how_to_close ?? [],
    },
    explain: { answer: r.explain?.answer ?? "", key_points: r.explain?.key_points ?? [] },
    done: !!r.done,
    next_hint: r.next_hint ?? "",
  };
}

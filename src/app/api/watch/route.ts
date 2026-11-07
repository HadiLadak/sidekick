import { Type } from "@google/genai";
import { apiKeys, clientFor, isQuotaError, markQuotaExceeded } from "@/lib/keys";
import { NextResponse } from "next/server";

export const maxDuration = 20;

// 3.1 first so the watchdog does not eat the daily quota of /api/sid's main model
const WATCH_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
const hits = new Map<string, number[]>();

/** A scam alert needs one of these, seen on screen. Odd-looking screens alone never count. */
const SIGNALS = ["fake_warning", "call_number", "urgent_payment", "credential_request", "remote_access", "lookalike_site"] as const;

const WATCH_PROMPT = `You watch a user's shared screen for scams. Answer with the clear scam signal you can SEE, if any:
- fake_warning: a fake virus, security or "your computer is locked" warning
- call_number: a pop-up or message telling them to call a phone number for support or to fix a problem
- urgent_payment: an urgent request to pay, send money, or buy gift cards
- credential_request: a request for a password, one-time code or card number on a suspicious or look-alike site
- remote_access: remote-access software (AnyDesk, TeamViewer and similar) being installed at a stranger's request
- lookalike_site: a login page on a misspelled or look-alike web address
Not scams: ordinary apps, settings, real bank or email sites, normal messages. Also NOT a scam: the "Sid" helper app itself (a yellow speech-bubble mascot, captions, a "Sid can see your screen" bar, a Stop button), and screens repeated inside themselves like a hall of mirrors, which simply happens when someone shares their whole screen. Ignore those completely and judge only the other content.
If there is no clear signal, answer signal "none" and scam false. Be conservative.`;

/** Only alert when the model names a concrete signal. */
function verdict(r: { signal?: string; scam?: boolean; severity?: string; reason?: string }) {
  const clear = !!r.signal && (SIGNALS as readonly string[]).includes(r.signal);
  const severity = r.severity === "suspicious" ? "suspicious" : "scam";
  return clear && r.scam ? { scam: true, severity, reason: r.reason ?? "", signal: r.signal } : { scam: false, severity: "none", reason: "" };
}

/**
 * Scam watchdog for Live mode. The Live model only speaks when spoken to, so the
 * browser sends a frame here whenever the screen changes. If this fast model sees a
 * scam, the browser nudges Sid to warn the user right away.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return NextResponse.json({ scam: false, throttled: true });
  recent.push(now);
  hits.set(ip, recent);

  const keys = apiKeys();
  if (!keys.length) return NextResponse.json({ scam: false });
  const body = await request.json().catch(() => null);
  const data = typeof body?.data === "string" ? body.data : "";
  if (!data || data.length > 2_500_000) return NextResponse.json({ scam: false });

  for (const model of WATCH_MODELS) for (const { key, index } of keys) {
    try {
      const res = await clientFor(key).models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { data, mimeType: "image/jpeg" } },
              {
                text: WATCH_PROMPT,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              signal: {
                type: Type.STRING,
                enum: [...SIGNALS, "none"],
                description: "The clear scam signal you can actually see, or none.",
              },
              scam: { type: Type.BOOLEAN },
              severity: { type: Type.STRING, enum: ["scam", "suspicious", "none"] },
              reason: { type: Type.STRING, description: "Short, plain reason, or empty." },
            },
            required: ["signal", "scam", "severity", "reason"],
            propertyOrdering: ["signal", "scam", "severity", "reason"],
          },
          temperature: 0,
          abortSignal: AbortSignal.timeout(8000),
        },
      });
      return NextResponse.json(verdict(JSON.parse(res.text ?? "{}")));
    } catch (err) {
      console.warn(`[watch] ${model} (key ${index + 1}) failed`, String(err).slice(0, 160));
      if (isQuotaError(err)) markQuotaExceeded(index);
    }
  }
  return NextResponse.json({ scam: false });
}

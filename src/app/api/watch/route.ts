import { Type } from "@google/genai";
import { apiKeys, clientFor, isQuotaError, markQuotaExceeded } from "@/lib/keys";
import { NextResponse } from "next/server";

export const maxDuration = 20;

// 3.1 first so the watchdog does not eat the daily quota of /api/sid's main model
const WATCH_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
const hits = new Map<string, number[]>();

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
                text: "Does this screen show a scam, fake virus/security warning, tech-support pop-up, phishing or look-alike login page, suspicious payment or gift-card request, or remote-access software being installed? Ordinary apps, settings, real bank/email sites and normal messages are NOT scams. Be conservative: only flag clear red flags.",
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scam: { type: Type.BOOLEAN },
              severity: { type: Type.STRING, enum: ["scam", "suspicious", "none"] },
              reason: { type: Type.STRING, description: "Short, plain reason, or empty." },
            },
            required: ["scam", "severity", "reason"],
          },
          temperature: 0,
          abortSignal: AbortSignal.timeout(8000),
        },
      });
      return NextResponse.json(JSON.parse(res.text ?? "{}"));
    } catch (err) {
      console.warn(`[watch] ${model} (key ${index + 1}) failed`, String(err).slice(0, 160));
      if (isQuotaError(err)) markQuotaExceeded(index);
    }
  }
  return NextResponse.json({ scam: false });
}

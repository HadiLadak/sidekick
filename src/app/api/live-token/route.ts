import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { LIVE_MODELS, liveConfig } from "@/lib/live-config";

const hits = new Map<string, number[]>();

/**
 * Issues a single-use, short-lived ephemeral token for one Gemini Live session.
 * The real API key never leaves the server, and the session config (system prompt,
 * tools) is locked into the token so the browser can't change it.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 12) {
    return NextResponse.json({ error: "rate_limited", message: "Too many live sessions. Wait a few minutes." }, { status: 429 });
  }
  recent.push(now);
  hits.set(ip, recent);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no_key", message: "Live help isn't connected yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const lang = typeof body.lang === "string" ? body.lang.slice(0, 5) : "en";
  const attempt = Math.max(0, Math.min(LIVE_MODELS.length - 1, Number(body.attempt) || 0));
  const model = LIVE_MODELS[attempt];

  try {
    const ai = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
        liveConnectConstraints: { model, config: liveConfig(lang) },
      },
    });
    return NextResponse.json(
      { token: token.name, model, hasFallback: attempt < LIVE_MODELS.length - 1 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[live-token] failed", err);
    return NextResponse.json({ error: "token_failed", message: "Live help couldn't start." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { apiKeys, clientFor, isQuotaError, markQuotaExceeded } from "@/lib/keys";
import { LIVE_MODELS, liveConfig } from "@/lib/live-config";

const hits = new Map<string, number[]>();

/**
 * Issues a single-use, short-lived ephemeral token for one Gemini Live session.
 * The real API key never leaves the server, and the session config (system prompt,
 * tools) is locked into the token so the browser can't change it.
 *
 * `attempt` walks through every (model, key) pair, so when the browser can't connect
 * (overloaded model, or a key out of quota) it asks again with attempt + 1.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 20) {
    return NextResponse.json({ error: "rate_limited", message: "Too many live sessions. Wait a few minutes." }, { status: 429 });
  }
  recent.push(now);
  hits.set(ip, recent);

  const keys = apiKeys();
  if (!keys.length) {
    return NextResponse.json({ error: "no_key", message: "Live help isn't connected yet." }, { status: 503 });
  }
  const combos = LIVE_MODELS.flatMap((model) => keys.map((k) => ({ model, ...k })));

  const body = await request.json().catch(() => ({}));
  const lang = typeof body.lang === "string" ? body.lang.slice(0, 5) : "en";
  let attempt = Math.max(0, Number(body.attempt) || 0);

  for (; attempt < combos.length; attempt++) {
    const { model, key, index } = combos[attempt];
    try {
      const token = await clientFor(key, "v1alpha").authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(now + 30 * 60_000).toISOString(),
          newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
          liveConnectConstraints: { model, config: liveConfig(lang) },
        },
      });
      return NextResponse.json(
        { token: token.name, model, attempt, hasFallback: attempt < combos.length - 1 },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (err) {
      console.error(`[live-token] ${model} (key ${index + 1}) failed`, String(err).slice(0, 160));
      if (isQuotaError(err)) markQuotaExceeded(index);
    }
  }
  return NextResponse.json({ error: "token_failed", message: "Live help couldn't start." }, { status: 502 });
}

import { NextResponse } from "next/server";
import { askSid, hasKey, SidFailure } from "@/lib/gemini";
import type { SidError, SidRequest } from "@/lib/types";

export const maxDuration = 60;

const MAX_IMAGE_B64 = 4_000_000; // ~3 MB image; the browser downsizes well below this
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 15;
}

function fail(status: number, body: SidError, started: number) {
  const ms = Date.now() - started;
  return NextResponse.json({ ...body, ms }, { status, headers: { "server-timing": `sid;dur=${ms}` } });
}

export async function POST(request: Request) {
  const started = Date.now();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return fail(429, { error: "rate_limited", message: "That's a lot of questions in one minute. Wait a moment, then try again." }, started);
  }

  let body: SidRequest;
  try {
    body = await request.json();
  } catch {
    return fail(400, { error: "bad_input", message: "That request couldn't be read. Try again." }, started);
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
  const image =
    body.image && typeof body.image.data === "string" && /^image\/(png|jpe?g|webp|gif)$/.test(body.image.mimeType)
      ? body.image
      : null;
  if (!text.trim() && !image) {
    return fail(400, { error: "bad_input", message: "Add a screenshot or type a question first." }, started);
  }
  if (image && image.data.length > MAX_IMAGE_B64) {
    return fail(413, { error: "too_large", message: "That picture is too big. Try a regular screenshot." }, started);
  }
  if (!hasKey()) {
    return fail(503, { error: "no_key", message: "Sid isn't connected yet. Try one of the examples below, or come back soon." }, started);
  }

  try {
    const result = await askSid({
      text,
      image,
      uiLanguage: typeof body.uiLanguage === "string" ? body.uiLanguage.slice(0, 10) : "en",
      history: Array.isArray(body.history) ? body.history.slice(-6) : [],
    });
    const ms = Date.now() - started;
    console.log(`[sid] answered by ${result.model} in ${ms}ms (mode ${result.mode})`);
    return NextResponse.json({ ...result, ms }, { headers: { "server-timing": `sid;dur=${ms}` } });
  } catch (err) {
    const kind = err instanceof SidFailure ? err.kind : "failed";
    console.error(`[sid] failed (${kind}) after ${Date.now() - started}ms`, String(err).slice(0, 300));
    if (kind === "quota") {
      return fail(429, { error: "quota", message: "Sid has answered a lot of questions today and needs a short break. Try again in a minute." }, started);
    }
    if (kind === "timeout") {
      return fail(504, { error: "timeout", message: "Sid took too long to answer. Try again; it's usually quicker the second time." }, started);
    }
    if (kind === "overloaded") {
      return fail(503, { error: "busy", message: "Sid's helpers are very busy right now. Try again in a few seconds." }, started);
    }
    return fail(502, { error: "model_failed", message: "Sid couldn't read that one. Try again, or send a clearer screenshot." }, started);
  }
}

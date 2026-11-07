import { NextResponse } from "next/server";
import { askSid, getClient } from "@/lib/gemini";
import type { SidError, SidRequest } from "@/lib/types";

export const maxDuration = 60;

const MAX_IMAGE_B64 = 4_000_000; // ~3 MB image; client downsizes well below this
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 15;
}

function fail(status: number, body: SidError) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return fail(429, { error: "rate_limited", message: "Too many questions in a minute. Wait a moment, then try again." });
  }

  let body: SidRequest;
  try {
    body = await request.json();
  } catch {
    return fail(400, { error: "bad_input", message: "That request could not be read." });
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
  const image =
    body.image && typeof body.image.data === "string" && /^image\/(png|jpe?g|webp|gif|heic)$/.test(body.image.mimeType)
      ? body.image
      : null;
  if (!text.trim() && !image) {
    return fail(400, { error: "bad_input", message: "Add a screenshot or type a question first." });
  }
  if (image && image.data.length > MAX_IMAGE_B64) {
    return fail(413, { error: "too_large", message: "That picture is too big. Try a regular screenshot." });
  }

  const ai = getClient();
  if (!ai) {
    return fail(503, { error: "no_key", message: "Sid isn't connected yet. Try a demo below, or come back soon." });
  }

  try {
    const result = await askSid(ai, {
      text,
      image,
      uiLanguage: typeof body.uiLanguage === "string" ? body.uiLanguage.slice(0, 10) : "en",
      history: Array.isArray(body.history) ? body.history.slice(-6) : [],
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[sid] model call failed", err);
    return fail(502, { error: "model_failed", message: "Sid couldn't read that one. Try again, or send a clearer screenshot." });
  }
}

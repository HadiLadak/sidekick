import { NextResponse } from "next/server";
import { hasKey, matchVerbs, normalize, responseSchema, SidFailure, streamSid, type SidStream } from "@/lib/gemini";
import { parsePartialJson } from "@/lib/partial-json";
import demoCache from "@/lib/demo-cache.json";
import type { SidError, SidRequest, SidResult } from "@/lib/types";

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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, { error: "bad_input", message: "That request couldn't be read. Try again." }, started);
  }
  const history = Array.isArray(body.history)
    ? body.history.filter((turn) => turn && typeof turn === "object" &&
        typeof turn.question === "string" && typeof turn.told_user === "string" &&
        typeof turn.title === "string" && ["show_me", "fix_it", "scam_check", "explain_it"].includes(turn.mode))
    : [];

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
  const req: SidRequest = {
    text,
    image,
    device: image && (body.device === "phone" || body.device === "computer") ? body.device : undefined,
    uiLanguage: typeof body.uiLanguage === "string" ? body.uiLanguage.slice(0, 10) : "en",
    history: (history.length > 6 ? [history[0], ...history.slice(-5)] : history).map((turn) => ({
      question: turn.question.slice(0, 4000), mode: turn.mode,
      title: turn.title.slice(0, 500), told_user: turn.told_user.slice(0, 4000),
    })),
  };

  // Automated tests replay saved answers instead of calling Gemini (never in production)
  const mock = process.env.VERCEL_ENV !== "production" && (request.headers.get("x-sid-mock") || process.env.SID_MOCK);
  if (mock) return streamResponse(mockStream(mock, req), started, null, req.device);

  if (!hasKey()) {
    return fail(503, { error: "no_key", message: "Sid isn't connected yet. Try one of the examples below, or come back soon." }, started);
  }

  let stream: SidStream;
  try {
    stream = await streamSid(req, request.signal);
  } catch (err) {
    return failFor(err, started);
  }
  return streamResponse(stream, started, (skip) => streamSid(req, request.signal, skip), req.device);
}

/**
 * Streams the answer as NDJSON so the page can show the title and verdict right away:
 *   {"t":"start","model","ms"}  {"t":"partial","data"}...  {"t":"done","result"}  or  {"t":"error",...}
 */
function streamResponse(
  first: SidStream,
  started: number,
  reopen: ((skip: string[]) => Promise<SidStream>) | null,
  device?: "phone" | "computer",
) {
  // English answers: "Click" on computer screenshots, "Tap" on phone ones (other languages rely on the prompt)
  const verbs = <T,>(x: T): T => {
    const lang = (x as { language?: string } | null)?.language ?? "en";
    return lang.startsWith("en") ? matchVerbs(x, device) : x;
  };
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let { model, chunks } = first;
      const failed: string[] = [];
      send({ t: "start", model, ms: Date.now() - started });
      for (;;) {
        let text = "";
        let lastSent = "";
        try {
          for await (const c of chunks) {
            text += c;
            const partial = parsePartialJson(text);
            const json = partial === undefined ? "" : JSON.stringify(partial);
            if (json && json !== lastSent) {
              lastSent = json;
              send({ t: "partial", data: verbs(partial) });
            }
          }
          const ms = Date.now() - started;
          const result: SidResult = verbs({ ...normalize(JSON.parse(text)), model, ms });
          console.log(`[sid] answered by ${model} in ${ms}ms (mode ${result.mode}${failed.length ? `, after ${failed.join(", ")} broke` : ""})`);
          send({ t: "done", result });
          break;
        } catch (err) {
          console.error(`[sid] stream from ${model} broke after ${Date.now() - started}ms`, String(err).slice(0, 200));
          failed.push(model);
          // A model can fail half-way (e.g. 503 mid-stream): start over on the next one
          const next = reopen && failed.length < 3 ? await reopen(failed).catch(() => null) : null;
          if (!next) {
            send({ t: "error", error: "model_failed", message: "Sid lost his train of thought. Try again.", ms: Date.now() - started });
            break;
          }
          ({ model, chunks } = next);
          send({ t: "restart", model });
        }
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

function failFor(err: unknown, started: number) {
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

/** A saved answer, streamed in small pieces like the real thing. `x-sid-mock: <demo id>` picks one. */
function mockStream(pick: string, req: SidRequest): SidStream {
  const cache = demoCache as unknown as Record<string, SidResult>;
  const id =
    pick in cache
      ? pick
      : /https?:|www\.|link|text|message|pay/i.test(req.text)
        ? "scam-text"
        : req.image
          ? "video-call"
          : "wifi-settings";
  const { model: _m, ms: _ms, ...saved } = cache[id];
  void _m;
  void _ms;
  // Same key order as the live schema (title and verdict first)
  const ordered = Object.fromEntries(
    [...(responseSchema.propertyOrdering as string[])].map((k) => [k, (saved as Record<string, unknown>)[k]]),
  );
  const text = JSON.stringify(ordered);
  const size = Math.ceil(text.length / 14);
  return {
    model: `mock:${id}`,
    chunks: (async function* () {
      await new Promise((r) => setTimeout(r, 400));
      for (let i = 0; i < text.length; i += size) {
        yield text.slice(i, i + size);
        await new Promise((r) => setTimeout(r, 120));
      }
    })(),
  };
}

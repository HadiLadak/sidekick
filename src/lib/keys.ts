import { GoogleGenAI } from "@google/genai";

/**
 * Two Gemini keys: GEMINI_API_KEY and GEMINI_API_KEY_2. When one runs out of quota (429),
 * we retry with the other and remember for a minute so later requests start with the healthy one.
 */
const cooldownUntil = new Map<number, number>();
const COOLDOWN_MS = 60_000;

export function apiKeys(): { index: number; key: string }[] {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2]
    .map((key, index) => ({ index, key: key?.trim() ?? "" }))
    .filter((k) => k.key);
  const now = Date.now();
  // Keys that recently hit their quota go last
  return keys.sort((a, b) => Number((cooldownUntil.get(a.index) ?? 0) > now) - Number((cooldownUntil.get(b.index) ?? 0) > now));
}

export function markQuotaExceeded(index: number) {
  cooldownUntil.set(index, Date.now() + COOLDOWN_MS);
}

const clients = new Map<string, GoogleGenAI>();
export function clientFor(key: string, apiVersion?: string) {
  const id = `${apiVersion ?? ""}:${key}`;
  let c = clients.get(id);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key, ...(apiVersion ? { apiVersion } : {}) });
    clients.set(id, c);
  }
  return c;
}

const msg = (err: unknown) => String((err as { message?: string })?.message ?? err);

export const isQuotaError = (err: unknown) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg(err));
export const isTimeoutError = (err: unknown) => /abort|timed? ?out|DEADLINE/i.test(msg(err));
export const isOverloadError = (err: unknown) => /\b(503|500)\b|UNAVAILABLE|overloaded|high demand|INTERNAL/i.test(msg(err));
export const isMissingModel = (err: unknown) => /\b404\b|not found|NOT_FOUND/i.test(msg(err));

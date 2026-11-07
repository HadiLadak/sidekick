export type Mode = "show_me" | "fix_it" | "scam_check" | "explain_it";
export type Verdict = "scam" | "suspicious" | "looks_safe";

/** [ymin, xmin, ymax, xmax], each normalized 0–1000 (Gemini's native box format). */
export type Box2D = [number, number, number, number];

export interface SidStep {
  /** One short, plain instruction ("Tap the blue Settings icon"). */
  instruction: string;
  /** Optional extra detail in plain words. */
  detail: string;
  /** Visible text or description of the thing to tap, e.g. "Wi-Fi". */
  target_label: string;
  /** Where the target is on the current screenshot. Empty when not visible. */
  box_2d: number[];
}

export interface SidResult {
  mode: Mode;
  /** BCP-47 code of the language Sid answered in, e.g. "en", "ur", "ar". */
  language: string;
  title: string;
  summary: string;
  /** True when the screenshot shows a password, PIN, card number or similar. */
  sensitive_info_visible: boolean;
  steps: SidStep[];
  fix: { what_went_wrong: string; likely_cause: string };
  scam: {
    verdict: Verdict | "";
    reasons: string[];
    do_not: string[];
    how_to_close: string[];
  };
  explain: { answer: string; key_points: string[] };
  /** True when the screenshot shows the user's problem is now solved. */
  done: boolean;
  /** What Sid wants to see next ("Send me a screenshot after you tap Wi-Fi"). */
  next_hint: string;
  /** Which Gemini model answered (for debugging). */
  model?: string;
}

/** A compact record of earlier turns, sent back so Sid can continue a flow. */
export interface Turn {
  question: string;
  mode: Mode;
  title: string;
  told_user: string;
}

export interface SidRequest {
  text: string;
  image?: { data: string; mimeType: string } | null;
  uiLanguage: string;
  history: Turn[];
}

export interface SidError {
  error: "no_key" | "bad_input" | "too_large" | "rate_limited" | "model_failed";
  message: string;
}

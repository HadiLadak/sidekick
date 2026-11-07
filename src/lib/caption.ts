/**
 * Live captions must only show what Sid actually said out loud.
 *  1. Cut at the first sign of written-only content (markdown headings, bold, code, lists):
 *     a spoken reply never contains them, so anything from there on was never said.
 *  2. Strip any leftover markdown symbols.
 *  3. Never show more text than the audio played so far could hold.
 */
const WRITTEN_ONLY = /\s*(?:#{1,6}\s|```|\*\*|__|(?:^|\n)\s*(?:[-*•]|\d+[.)])\s|\n\s*\n)/;

/** Generous speaking rate: ~22 characters a second, plus slack for the first words. */
const CHARS_PER_SEC = 22;
const SLACK = 40;

export function cleanCaption(raw: string, audioSeconds: number): string {
  let s = raw;
  const cut = s.search(WRITTEN_ONLY);
  if (cut >= 0) s = s.slice(0, cut);
  s = s
    .replace(/[*_#`>|~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const max = Math.round(SLACK + audioSeconds * CHARS_PER_SEC);
  if (s.length > max) {
    // End on a sentence or word boundary
    const clipped = s.slice(0, max);
    const sentence = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("? "), clipped.lastIndexOf("! "), clipped.lastIndexOf("۔ "), clipped.lastIndexOf("؟ "));
    s = sentence > max * 0.5 ? clipped.slice(0, sentence + 1) : clipped.slice(0, Math.max(clipped.lastIndexOf(" "), 1)) + "…";
  }
  return s;
}

/** Language tag for a caption, from its script, so Urdu gets the Nastaliq font even in an English UI. */
export function captionLang(text: string, uiLang: string): string {
  if (/[؀-ۿ]/.test(text)) return uiLang === "ar" ? "ar" : "ur";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  return uiLang === "ur" || uiLang === "ar" ? "en" : uiLang;
}

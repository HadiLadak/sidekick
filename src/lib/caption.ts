/**
 * Live captions must only show what Sid actually said out loud.
 *  1. Cut at the first sign of written-only content (markdown headings, bold, code, lists):
 *     a spoken reply never contains them, so anything from there on was never said.
 *     Same for leaked stage directions like "<no speech{pause}".
 *  2. Strip any leftover markdown symbols.
 *  3. Never show more text than the audio played so far could hold.
 */
const WRITTEN_ONLY = /\s*(?:#{1,6}\s|```|\*\*|__|(?:^|\n)\s*(?:[-*•]|\d+[.)])\s|\n\s*\n)/;
/** Leaked stage directions from our own prompts ("<no speech{pause}", "[no speech]", "(no_speech)"): never spoken. */
const STAGE_DIRECTION = /[<[(]\s*no[\s_-]*speech|\{\s*pause\s*\}|\bno[\s_-]*speech\b(?=\s*(?:[.!,)\]}>]|$))/i;
/** A whole caption that is only a meta word ("Unchanged.", "Silence", "No change") was never meant to be heard. */
const ONLY_META = /^\W*(?:no[\s_-]*speech|silence|silent|unchanged|no change|uncertain|pause|waiting|no response|nothing)\W*$/i;

/** Generous speaking rate: ~22 characters a second, plus slack for the first words. */
const CHARS_PER_SEC = 22;
const SLACK = 40;

export function cleanCaption(raw: string, audioSeconds: number): string {
  let s = raw;
  // Cut at whichever comes first: written-only content or a leaked stage direction
  const cuts = [s.search(WRITTEN_ONLY), s.search(STAGE_DIRECTION)].filter((i) => i >= 0);
  if (cuts.length) s = s.slice(0, Math.min(...cuts));
  s = s
    .replace(/[*_#`>|~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (ONLY_META.test(s)) return "";
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

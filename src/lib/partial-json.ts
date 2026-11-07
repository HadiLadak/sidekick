/**
 * Parses JSON that is still arriving (a streamed model answer), e.g.
 * `{"mode":"scam_check","title":"Fake Canada Po` -> { mode: "scam_check", title: "Fake Canada Po" }.
 * Unfinished strings are closed, dangling keys and half-written literals are dropped,
 * and open objects/arrays are closed. Returns undefined if it still can't be read.
 */
export function parsePartialJson(text: string): unknown {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let s = text;
  if (inStr) s = (esc ? s.slice(0, -1) : s) + '"';
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(/[\s,]+$/, "");
    // half-written literal or number sign after a separator
    s = s.replace(/([:[,]\s*)(?:t|tr|tru|f|fa|fal|fals|n|nu|nul|-)$/, "$1");
    s = s.replace(/(\d)[.eE][+-]?$/, "$1");
    // an object key with no value yet: {"a":1,"b   or   {"a":1,"b":
    if (stack[stack.length - 1] === "{") s = s.replace(/([{,])\s*"(?:[^"\\]|\\.)*"\s*:?\s*$/, "$1");
    s = s.replace(/:\s*$/, ":null");
    if (s === before) break;
  }
  s = s.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === "{" ? "}" : "]";
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

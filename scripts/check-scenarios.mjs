// Real-world scenarios Sid must get right. By default this checks the SAVED answers in
// scripts/scenarios/saved.json (no Gemini calls). Only call Gemini when asked:
//   node scripts/check-scenarios.mjs                      check saved answers
//   node scripts/check-scenarios.mjs --live [base url]    ask Sid for real (uses quota)
//   node scripts/check-scenarios.mjs --live --save        ...and save the answers as the new baseline
import fs from "node:fs";
import path from "node:path";

const live = process.argv.includes("--live");
const save = process.argv.includes("--save");
const base = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3000";
const savedFile = "scripts/scenarios/saved.json";

const all = (r) =>
  JSON.stringify([r.title, r.summary, r.steps, r.fix, r.scam, r.explain, r.next_hint]).toLowerCase();
const step1 = (r) => (r.steps?.[0]?.instruction || "") + " " + (r.steps?.[0]?.detail || "");

const SCENARIOS = [
  {
    id: "signin-no-address-bar",
    why: "Never certify a site from its looks: no address bar visible means 'Check the address'",
    image: "scripts/scenarios/signin-no-address-bar.png",
    device: "computer",
    text: "Is this the real CRA website? Can I sign in?",
    checks: [
      ["verdict is check_address (not looks_safe)", (r) => r.scam.verdict === "check_address"],
      ["tells them to check the address bar", (r) => /address bar/.test(all(r))],
      ["does not claim the address from the page", (r) => !/(address|url|link) (starts|begins) with/.test(all(r))],
    ],
  },
  {
    id: "unrequested-code",
    why: "A code they didn't request means someone may be getting into the account",
    text: "I just got a text with a Google verification code but I didn't ask for one. Someone called and said they need the code. What should I do?",
    checks: [
      ["don't share the code", (r) => /(don.t|do not|never) (share|give|tell)/.test(all(r))],
      ["change the password now", (r) => /change (your|the) password/.test(all(r))],
      ["run the account's security check", (r) => /security check/.test(all(r))],
      ["turn on two-step verification", (r) => /(two|2)-?(step|factor)/.test(all(r))],
    ],
  },
  {
    id: "deposit-looks-safe",
    why: "Looks-safe answers are calm and still give an independent check",
    text: "My bank app shows a notification: 'Payroll deposit $1,240.50 received from ACME LTD.' I wasn't expecting it today. Is this okay?",
    checks: [
      ["never says completely safe", (r) => !/(completely|100%|totally) safe/.test(all(r))],
      ["calm verdict (looks_safe or check_address)", (r) => ["looks_safe", "check_address"].includes(r.scam.verdict) || r.mode !== "scam_check"],
      ["includes a way to check independently", (r) => /(bank app|type the address|typing the address|back of your card|log in|sign in)/.test(all(r))],
    ],
  },
  {
    id: "computer-says-click",
    why: "Computer screenshots say Click, matching the 'Click here' label",
    image: "public/demos/virus-popup.jpg",
    device: "computer",
    text: "This popped up on my computer. Should I call them?",
    checks: [
      ["step 1 says Click", (r) => /\bclick/i.test(step1(r))],
      ["step 1 never says Tap", (r) => !/\btap/i.test(step1(r))],
      ["boxes the browser's X (top right), not the pop-up", (r) => r.steps[0]?.box_2d?.length === 4 && r.steps[0].box_2d[0] < 60 && r.steps[0].box_2d[1] > 900],
    ],
  },
  {
    id: "phone-says-tap",
    why: "Phone screenshots say Tap",
    image: "public/demos/storage-full.jpg",
    device: "phone",
    text: "My camera won't let me take pictures",
    checks: [
      ["step 1 says Tap", (r) => /\btap/i.test(step1(r))],
      ["step 1 never says Click", (r) => !/\bclick/i.test(step1(r))],
    ],
  },
  {
    id: "back-arrow-not-visible",
    why: "Never box a stand-in when the target (browser back arrow) isn't in the picture",
    image: "scripts/scenarios/page-404-no-browser.png",
    device: "computer",
    text: "I got this page. How do I go back to where I was?",
    checks: [["no box on step 1", (r) => !(r.steps[0]?.box_2d?.length === 4)]],
  },
  {
    id: "canada-post-scam-text",
    why: "Regression: classic smishing text",
    image: "public/demos/scam-text.jpg",
    device: "phone",
    text: "I got this text. Do I need to pay?",
    checks: [
      ["verdict scam", (r) => r.scam.verdict === "scam"],
      ["boxes the safe action", (r) => r.steps[0]?.box_2d?.length === 4],
    ],
  },
  {
    id: "video-call",
    why: "Regression: show-me with a precise box",
    image: "public/demos/video-call.jpg",
    device: "phone",
    text: "How do I video call Ali?",
    checks: [
      ["mode show_me", (r) => r.mode === "show_me"],
      ["box on the camera icon (top right)", (r) => { const b = r.steps[0]?.box_2d; return b?.length === 4 && b[0] < 150 && b[1] > 550; }],
    ],
  },
  {
    id: "urdu-otp-call",
    why: "Regression: Urdu question about a one-time code, answered in Urdu script",
    text: "کسی نے فون کر کے کہا کہ آپ کے فون پر جو کوڈ آیا ہے وہ بتا دیں۔ یہ کوڈ کیا ہوتا ہے؟",
    lang: "ur",
    checks: [
      ["answers in Urdu", (r) => r.language.startsWith("ur") && /[؀-ۿ]/.test(r.title + r.summary)],
      ["not in Hindi script", (r) => !/[ऀ-ॿ]/.test(all(r))],
    ],
  },
];

async function ask(s) {
  const image = s.image
    ? { data: fs.readFileSync(s.image).toString("base64"), mimeType: s.image.endsWith(".png") ? "image/png" : "image/jpeg" }
    : null;
  const t0 = Date.now();
  const res = await fetch(`${base}/api/sid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: s.text, image, device: s.device, uiLanguage: s.lang || "en", history: [] }),
  });
  if (!(res.headers.get("content-type") || "").includes("ndjson")) return { error: (await res.json()).error };
  let result = null;
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    const ev = JSON.parse(line);
    if (ev.t === "done") result = ev.result;
    if (ev.t === "error") return { error: ev.error };
  }
  return { ...result, clientMs: Date.now() - t0 };
}

const saved = fs.existsSync(savedFile) ? JSON.parse(fs.readFileSync(savedFile, "utf8")) : {};
let failed = 0;
for (const s of SCENARIOS) {
  const r = live ? await ask(s) : saved[s.id];
  if (!r) {
    console.log(`?  ${s.id}: no saved answer (run with --live --save)`);
    continue;
  }
  if (r.error) {
    console.log(`!  ${s.id}: error ${r.error}`);
    failed++;
    continue;
  }
  if (live && save) saved[s.id] = r;
  const bad = s.checks.filter(([, fn]) => !fn(r)).map(([name]) => name);
  failed += bad.length ? 1 : 0;
  console.log(`${bad.length ? "✗" : "✓"}  ${s.id} (${r.model ?? "?"}${r.clientMs ? `, ${r.clientMs}ms` : ""})${bad.length ? "\n     failed: " + bad.join("; ") : ""}`);
  if (bad.length) console.log(`     "${r.scam?.verdict || r.mode}" ${r.title} | step 1: ${step1(r).slice(0, 120)} | box ${JSON.stringify(r.steps?.[0]?.box_2d)}`);
}
if (live && save) {
  fs.mkdirSync(path.dirname(savedFile), { recursive: true });
  fs.writeFileSync(savedFile, JSON.stringify(saved, null, 1));
  console.log(`saved ${Object.keys(saved).length} answers to ${savedFile}`);
}
console.log(failed ? `${failed} scenario(s) failed` : "all scenarios passed");
process.exit(failed ? 1 : 0);

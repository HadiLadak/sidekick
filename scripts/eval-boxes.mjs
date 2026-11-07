// Sends screenshots through the live /api/sid route, then draws each returned box_2d
// (converted from 0–1000 to pixels) on the image so accuracy can be checked by eye.
// Usage: node scripts/eval-boxes.mjs <playwright-core path> <out dir> [base url] [--save-cache]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const outDir = process.argv[3];
const base = process.argv[4] && !process.argv[4].startsWith("--") ? process.argv[4] : "http://localhost:3000";
const saveCache = process.argv.includes("--save-cache");
fs.mkdirSync(outDir, { recursive: true });

const cases = [
  { id: "scam-text", file: "public/demos/scam-text.jpg", text: "I got this text. Do I need to pay?", expect: "Report Junk link (safe action)" },
  { id: "video-call", file: "public/demos/video-call.jpg", text: "How do I video call Ali?", expect: "video camera icon, top right" },
  { id: "virus-popup", file: "public/demos/virus-popup.jpg", text: "This popped up on my computer. Should I call them?", expect: "tab ✕ / window close (safe)" },
  { id: "storage-full", file: "public/demos/storage-full.jpg", text: "My camera won't let me take pictures", expect: "Settings button in dialog" },
  { id: "wifi-settings", file: "public/demos/wifi-settings.jpg", text: "How do I connect to my daughter's Wi-Fi?", expect: "Network & internet row" },
  ...(process.env.EXTRA_CASES ? JSON.parse(process.env.EXTRA_CASES) : []),
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const cache = {};
for (const c of cases) {
  const buf = fs.readFileSync(c.file);
  const mime = c.file.endsWith(".png") ? "image/png" : "image/jpeg";
  const t0 = Date.now();
  const res = await fetch(`${base}/api/sid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: c.text, image: { data: buf.toString("base64"), mimeType: mime }, uiLanguage: "en", history: [] }),
  });
  const json = await res.json();
  const ms = Date.now() - t0;
  if (json.error) {
    console.log(`${c.id}: ERROR ${json.error} (${ms}ms)`);
    continue;
  }
  cache[c.id] = json;
  const box = json.steps?.[0]?.box_2d ?? [];
  console.log(
    `${c.id}: mode=${json.mode} verdict=${json.scam.verdict || "-"} model=${json.model} ${ms}ms\n  step1="${json.steps?.[0]?.instruction}" target="${json.steps?.[0]?.target_label}" box=${JSON.stringify(box)}\n  expected: ${c.expect}`,
  );
  const url = `data:${mime};base64,${buf.toString("base64")}`;
  await page.setContent(`<body style="margin:0"><canvas id=c></canvas></body>`);
  const shot = await page.evaluate(
    async ({ url, box }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.getElementById("c");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      if (box.length === 4) {
        const [ymin, xmin, ymax, xmax] = box;
        const W = c.width, H = c.height;
        ctx.lineWidth = Math.max(4, W / 150);
        ctx.strokeStyle = "#ff00aa";
        ctx.strokeRect((xmin / 1000) * W, (ymin / 1000) * H, ((xmax - xmin) / 1000) * W, ((ymax - ymin) / 1000) * H);
      }
      return c.toDataURL("image/jpeg", 0.7);
    },
    { url, box },
  );
  fs.writeFileSync(path.join(outDir, `${c.id}.jpg`), Buffer.from(shot.split(",")[1], "base64"));
}
await browser.close();
if (saveCache) {
  fs.writeFileSync("src/lib/demo-cache.json", JSON.stringify(cache, null, 2) + "\n");
  console.log("saved demo cache");
}

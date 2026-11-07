// End-to-end Live mode test in real Chrome with a fake mic (a WAV of a spoken question)
// and an auto-picked shared tab. Captures the app UI so captions/highlights can be checked.
// Usage: node scripts/live-browser-test.mjs <playwright-core> <question.wav> <out dir> <shared page url> <tab title>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const [pw, wav, outDir, sharedUrl, title, appUrl = "http://localhost:3000"] = process.argv.slice(2);
const { chromium } = require(pw);
fs.mkdirSync(outDir, { recursive: true });

// Pad the question with silence so Sid hears: (silence) question (silence)
const raw = fs.readFileSync(wav);
const rate = raw.readUInt32LE(24);
const dataAt = raw.indexOf("data") + 8;
const pcm = raw.subarray(dataAt);
const pad = (s) => Buffer.alloc(Math.round(rate * s) * 2);
const body = Buffer.concat([pad(5), pcm, pad(30)]);
const h = Buffer.alloc(44); // canonical PCM WAV header
h.write("RIFF", 0);
h.writeUInt32LE(36 + body.length, 4);
h.write("WAVEfmt ", 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(1, 22);
h.writeUInt32LE(rate, 24);
h.writeUInt32LE(rate * 2, 28);
h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34);
h.write("data", 36);
h.writeUInt32LE(body.length, 40);
const padded = path.join(outDir, "mic.wav");
fs.writeFileSync(padded, Buffer.concat([h, body]));

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${padded}%noloop`,
    `--auto-select-tab-capture-source-by-title=${title}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({ viewport: { width: Number(process.env.VW || 430), height: Number(process.env.VH || 900) }, permissions: ["microphone", "camera"] });
const shared = await ctx.newPage();
await shared.goto(sharedUrl);
const app = await ctx.newPage();
const logs = [];
app.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
app.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
app.on("websocket", (ws) => logs.push(`[ws] open ${ws.url().slice(0, 90)}`));
await app.goto(appUrl + (process.env.TEST_SCREEN ? `?testScreen=${process.env.TEST_SCREEN}` : ""));
await app.getByRole("button", { name: /start live help/i }).first().click();
await app.getByRole("button", { name: /start talking/i }).click();
if (process.env.NOPIP) {
  await app.getByRole("button", { name: /bring sid back/i }).click({ timeout: 8000 }).catch(() => {});
}
const t0 = Date.now();
for (let i = 1; i <= 9; i++) {
  await app.waitForTimeout(3000);
  await app.screenshot({ path: path.join(outDir, `live-${i}.png`) });
  const text = await app.locator("main").innerText();
  const dbg = await app.evaluate(() => JSON.stringify(window.__sidDebug));
  logs.push(`--- dbg ${dbg}`);
  logs.push(`--- t=${((Date.now() - t0) / 1000).toFixed(1)}s ${text.replace(/\s+/g, " ").slice(0, 400)}`);
}
fs.writeFileSync(path.join(outDir, "log.txt"), logs.join("\n"));
console.log(logs.filter((l) => /---|error|ws/.test(l)).join("\n"));
await browser.close();

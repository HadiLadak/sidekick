// Spike: ephemeral token -> Live session -> screen frame + question -> spoken answer.
// Run: node --experimental-strip-types scripts/live-spike.mts <model> <image> "<question>" [lang]
import fs from "node:fs";
import { GoogleGenAI, Modality } from "@google/genai";
import { liveConfig } from "../src/lib/live-config.ts";

const key = fs.readFileSync(".env.local", "utf8").match(/^GEMINI_API_KEY=["']?([^"'\r\n]+)/m)?.[1];
const [model, image, question, lang = "en"] = process.argv.slice(2);

const server = new GoogleGenAI({ apiKey: key, apiVersion: "v1alpha" });
const t0 = Date.now();
const now = () => `${((Date.now() - t0) / 1000).toFixed(2)}s`;
const token = await server.authTokens.create({
  config: {
    uses: 1,
    expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
    newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
    liveConnectConstraints: { model, config: liveConfig(lang) },
  },
});
console.log(now(), "token minted:", token.name?.slice(0, 18) + "…");

// Browser side: only the token, never the key
const client = new GoogleGenAI({ apiKey: token.name!, apiVersion: "v1alpha" });
let firstAudio = 0;
let audioBytes = 0;
let said = "";
let sentAt = 0;
let toolTurns = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let live: any;
const done = new Promise<void>((resolve) => {
  client.live
    .connect({
      model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onopen: () => console.log(now(), "socket open"),
        onmessage: (m) => {
          if (m.setupComplete) console.log(now(), "setup complete");
          for (const p of m.serverContent?.modelTurn?.parts ?? []) {
            if (p.inlineData?.data) {
              if (!firstAudio && sentAt) {
                firstAudio = Date.now();
                console.log(now(), `FIRST AUDIO (${firstAudio - sentAt}ms after question)`, p.inlineData.mimeType);
              }
              audioBytes += p.inlineData.data.length * 0.75;
            }
          }
          if (m.serverContent?.outputTranscription?.text) said += m.serverContent.outputTranscription.text;
          if (m.toolCall) {
            console.log(now(), "TOOL CALL", JSON.stringify(m.toolCall.functionCalls));
            toolTurns++;
            live?.sendToolResponse({
              functionResponses: (m.toolCall.functionCalls ?? []).map((f) => ({ id: f.id, name: f.name, response: { result: "shown" } })),
            });
          }
          if (m.serverContent?.turnComplete && sentAt && (audioBytes > 0 || toolTurns > 3)) {
            console.log(now(), "turn complete; audio", Math.round(audioBytes / 48000), "s of 24kHz pcm");
            console.log("SID SAID:", said.trim());
            resolve();
          }
        },
        onerror: (e) => console.log(now(), "error", e.message),
        onclose: (e) => {
          console.log(now(), "closed", e.code, e.reason);
          resolve();
        },
      },
    })
    .then(async (session) => {
      live = session;
      await new Promise((r) => setTimeout(r, 300));
      const data = fs.readFileSync(image).toString("base64");
      session.sendRealtimeInput({ video: { data, mimeType: "image/jpeg" } });
      await new Promise((r) => setTimeout(r, 1200));
      session.sendRealtimeInput({ video: { data, mimeType: "image/jpeg" } });
      sentAt = Date.now();
      if (question) session.sendRealtimeInput({ text: question });
      console.log(now(), "sent frame + question");
      setTimeout(() => session.close(), 25_000);
      await done;
      session.close();
    });
});
await done;

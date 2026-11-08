/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS hook loads the existing TS helpers */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
// Load the actual pure TypeScript helpers without adding a test runtime dependency.
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { boxToPixels } = require("../src/lib/image.ts");
const { parsePartialJson } = require("../src/lib/partial-json.ts");
assert.deepEqual(boxToPixels([100, 200, 300, 400], 1000, 500), { x: 200, y: 50, w: 200, h: 100, cx: 300, cy: 100 });
assert.deepEqual(boxToPixels([300, 400, 100, 200], 1000, 500), boxToPixels([100, 200, 300, 400], 1000, 500));
for (const box of [[0, 0, 0, 100], [0, 0, 100, 0], [NaN, 0, 100, 100], [0, 0, Infinity, 100], []]) assert.equal(boxToPixels(box, 100, 100), null);
assert.equal(boxToPixels([-100, -100, 1100, 1100], 100, 100).w, 100);
console.log("PASS highlight coordinates, bounds, reversed and invalid boxes");
const answer = { mode: "show_me", title: "Open Wi-Fi", sensitive_info_visible: false, steps: [{ instruction: 'Tap "Settings"', box_2d: [1, 2, 3, 4] }] };
const json = JSON.stringify(answer);
for (let i = 0; i <= json.length; i++) assert.doesNotThrow(() => parsePartialJson(json.slice(0, i)));
assert.deepEqual(parsePartialJson(json), answer);
console.log("PASS streaming JSON across every character boundary");

// A gap between streamed audio chunks is not the end of Sid's response.
const { LiveSid } = require("../src/lib/live-session.ts");
const sid = new LiveSid({ source: "screen", lang: "en", onEvent() {} });
let toolResponse;
sid.session = { sendToolResponse(value) { toolResponse = value; } };
sid.onMessage({ serverContent: { inputTranscription: { text: "Help me open settings" } } });
assert.equal(sid.modelBusy, true);
sid.onMessage({ serverContent: { turnComplete: true } });
assert.equal(sid.modelBusy, false);
sid.onMessage({ serverContent: { modelTurn: { parts: [] } } });
assert.equal(sid.modelBusy, true);
sid.onMessage({ toolCall: { functionCalls: [{ id: "highlight-1", name: "highlight", args: { instruction: "Open Settings" } }] } });
assert.equal(toolResponse.functionResponses[0].scheduling, "SILENT");
assert.equal(sid.modelBusy, true);
sid.onMessage({ serverContent: { turnComplete: true } });
assert.equal(sid.modelBusy, false);
console.log("PASS live turn stays busy until completion and tool acknowledgments stay silent");

// Live captions: leaked prompt stage directions and markdown are never shown.
const { cleanCaption } = require("../src/lib/caption.ts");
const cap = (raw) => cleanCaption(raw, 60);
assert.equal(cap("<no speech{pause}"), "");
assert.equal(cap("Tap the blue Settings icon. <no speech{pause}"), "Tap the blue Settings icon.");
assert.equal(cap("Okay. {pause} more"), "Okay.");
assert.equal(cap("Good. [no speech]"), "Good.");
assert.equal(cap("Fine (no_speech)"), "Fine");
assert.equal(cap("< No Speech >"), "");
assert.equal(cap("Click Wi-Fi. **Step 2** do this"), "Click Wi-Fi.");
assert.equal(cap("Done.\n\n- extra list"), "Done.");
assert.equal(cap("Tap here, then wait a little."), "Tap here, then wait a little.");
assert.equal(cap("There is no speech bubble on screen."), "There is no speech bubble on screen."); // plain words stay
assert.equal(cap("بٹن دبائیں۔ <no speech{pause}"), "بٹن دبائیں۔");
console.log("PASS live captions drop leaked stage directions and markdown, keep real speech");

// ...and through the live session itself: nothing leaked reaches the screen or the next progress prompt.
{
  const events = [];
  const live = new LiveSid({ source: "screen", lang: "en", onEvent: (e) => events.push(e) });
  live.onMessage({ serverContent: { inputTranscription: { text: "Help me with Wi-Fi" } } });
  live.onMessage({ serverContent: { turnComplete: true } });
  // a turn that is only a leaked stage direction (with some audio behind it)
  live.turnAudioSec = 2;
  live.onMessage({ serverContent: { outputTranscription: { text: "<no speech{pause}" } } });
  live.onMessage({ serverContent: { turnComplete: true } });
  assert.ok(!events.some((e) => e.type === "sid-caption"), "no caption for a stage-direction-only turn");
  assert.equal(live.stepPending, false, "a stage-direction-only turn is not a new step");
  // a real instruction followed by a leak
  live.turnAudioSec = 3;
  live.onMessage({ serverContent: { outputTranscription: { text: "Click the Wi-Fi icon. <no speech{pause}" } } });
  live.onMessage({ serverContent: { turnComplete: true } });
  const caps = events.filter((e) => e.type === "sid-caption").map((e) => e.text);
  assert.ok(caps.length > 0 && caps.every((c) => c === "Click the Wi-Fi icon."), caps.join(" | "));
  assert.equal(live.lastInstruction, "Click the Wi-Fi icon.");
  console.log("PASS live session shows and remembers only what Sid really said");
}

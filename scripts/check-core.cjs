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

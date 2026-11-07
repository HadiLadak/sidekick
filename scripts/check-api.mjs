import assert from "node:assert/strict";

const base = process.argv[2] || "http://localhost:3000";
const cases = [
  ["null body", null, 400],
  ["array body", [], 400],
  ["empty request", {}, 400],
  ["wrong text type", { text: 42 }, 400],
  ["invalid image", { image: { data: "bad", mimeType: "text/plain" } }, 400],
  ["oversized screenshot", { image: { data: "A".repeat(4_000_004), mimeType: "image/png" } }, 413],
];
for (const [name, body, expected] of cases) {
  const response = await fetch(`${base}/api/sid`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(response.status, expected, name);
  assert.ok((await response.json()).error, name);
  console.log(`PASS ${name}`);
}
// Exercise the real streaming route with saved model output, without API keys/quota.
for (const [demo, device] of [["video-call", "phone"], ["virus-popup", "computer"]]) {
  const response = await fetch(`${base}/api/sid`, {
    method: "POST", headers: { "content-type": "application/json", "x-sid-mock": demo },
    body: JSON.stringify({ text: "Help with this screen", image: { data: "AA==", mimeType: "image/jpeg" }, device, history: [null, 42, { question: "invalid" }] }),
  });
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.equal(events[0].t, "start");
  assert.ok(events.some((event) => event.t === "partial"));
  assert.equal(events.at(-1).t, "done");
  const result = events.at(-1).result;
  assert.ok(result.steps.length);
  assert.match(result.steps[0].instruction, device === "phone" ? /tap/i : /click/i);
  console.log(`PASS streamed ${device} screenshot with malformed history`);
}

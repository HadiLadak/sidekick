# Sid, your tech sidekick

Sid helps anyone with phone and computer problems, in their own language. Talk to him while he watches your screen, or send him a screenshot. He points at exactly what to tap, fixes errors, spots scams, and explains tech in plain words.

**Live:** https://sidekick-eosin-seven.vercel.app

Built at CSSS Fall Hacks 2026 (theme: digital sidekick).

## What it does

**Live help (the main feature).** Press *Start live help*, share your screen (laptop) or camera (phone, for things like routers and printers), and just talk. Sid sees about one frame a second, answers out loud in his own voice, and draws a pulsing ring and arrow on the exact button to press. You can interrupt him mid-sentence. He keeps a list of the steps you've done, and if a scam pop-up or phishing page shows up he warns you without being asked. He can float on top of other windows (Document Picture-in-Picture in Chrome and Edge), so he stays with you while you work.

**Screenshot help.** Upload, paste or drop a screenshot, or type or speak a question. One Gemini call picks the right mode:

- **Show me:** the next step in plain words, with the ring on the exact element to tap
- **Fix it:** what went wrong, why, then step-by-step fixes
- **Scam check:** Scam / Suspicious / Looks safe, what not to do, and how to close it safely
- **Explain it:** plain-language answers to tech questions

After each step you send the next screenshot and Sid carries on until it's fixed, then celebrates with you.

**Made for parents and grandparents too**

- Simple mode: bigger text, answers read aloud automatically, and voice questions send themselves
- English, French, Spanish, Urdu and Arabic, with full right-to-left layout and Nastaliq type for Urdu
- *Ask my family* drafts a message with the screenshot for a relative. It only shares or copies, it never sends anything itself
- Sid never asks for passwords, PINs or card numbers, and tells you to cover them if a screenshot shows one
- No accounts. Nothing is saved

## How it works

| Piece | What it does |
| --- | --- |
| `src/app/api/sid` | Screenshot help: one `generateContent` call with structured JSON output (mode, steps, `box_2d`, scam verdict). Falls back from the newest Flash model through older ones on overload or quota limits |
| `src/app/api/live-token` | Mints a single-use, short-lived **ephemeral token** for the Gemini Live API. The system prompt and tools are locked into the token, and the API key never reaches the browser |
| `src/lib/live-session.ts` | Browser side of Live: mic to 16 kHz PCM through an AudioWorklet, screen or camera frames at about 1 fps, playback of Sid's 24 kHz voice, interruption handling, and the tool calls (`highlight`, `scam_alert`, `step_done`, `ask_family`) |
| `src/app/api/watch` | Scam watchdog. The Live model only speaks when spoken to, so when the screen changes, a fast Flash-Lite check looks for scams and nudges Sid to warn you |
| `src/components/tap-spot.tsx` | The ring and arrow. Gemini returns `box_2d` as `[ymin, xmin, ymax, xmax]` normalized 0 to 1000. We convert that to image pixels and draw an SVG overlay in the image's own coordinate space, so it scales with the picture |

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, `@google/genai`, Vercel.

## Accuracy

`scripts/eval-boxes.mjs` sends screenshots through the real API and draws the returned boxes so you can check them by eye. On 5 mock-up phone and desktop screens and 6 real websites (canada.ca CRA sign-in, GitHub login, Google sign-in, Canada Post tracking, Weather Canada, Wikipedia), every box we got back landed on the right element. The Wikipedia run hit a quota error, so it has no result. Measured Live latency: Sid's spoken answer starts about 0.9 to 1.8 s after the question, and the `highlight` call comes in about 1 s.

## Run locally

```bash
npm install
echo GEMINI_API_KEY=your_key > .env.local
npm run dev
```

Optional: `GEMINI_MODEL` and `GEMINI_LIVE_MODEL` override the default models.

## Privacy

Screenshots and screen frames go only to Gemini to answer your question. Nothing is stored on our side, and there are no accounts or analytics. Live mode always shows a "Sid can see your screen" indicator with a one-tap Stop, and it reminds you to close password and banking windows before you start.

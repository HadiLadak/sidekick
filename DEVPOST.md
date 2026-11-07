# Devpost draft: Sid, your tech sidekick

**Tagline:** A patient tech helper who watches your screen, talks you through it, and spots scams before you click.

## Inspiration

Every family has someone who gets the phone calls. "The Wi-Fi's gone." "There's a message saying my computer has a virus." "How do I video call the grandkids?" Helping over the phone is hard because you can't see their screen and they can't describe it. Our parents also get a steady stream of fake Canada Post, CRA and Interac texts. We wanted to give them that helpful family member whenever they need one, in their own language.

## What it does

Sid is a tech sidekick with two ways to help.

**Live help.** Share your screen or point your phone's camera at a device, and just talk. Sid sees what you see, answers out loud, and draws a big pulsing circle and arrow on the exact button to press, one step at a time. You can interrupt him. He ticks off steps as he sees you do them. If a fake virus warning or phishing page appears, he warns you before you ask. He floats on top of your other windows so he stays with you.

**Screenshot help.** Send a screenshot, paste a strange text, or ask a question by typing or speaking. Sid works out what you need:

- **Show me:** the next step, with the circle on the exact spot
- **Fix it:** what went wrong, why, and how to fix it
- **Scam check:** a clear verdict, the red flags, what not to do, and how to close it safely
- **Explain it:** plain answers with no jargon

Simple mode makes everything bigger and reads answers aloud. Sid speaks English, French, Spanish, Urdu and Arabic, with a proper right-to-left layout. *Ask my family* writes a message with your screenshot for a relative, but you choose who gets it, because it never sends anything by itself. Sid never asks for passwords, PINs or card numbers, and there are no accounts.

## How we built it

- **Next.js 16 + TypeScript + Tailwind 4** on Vercel
- **Gemini Live API** (`gemini-3.8-live`) for real-time voice and vision. Our server mints single-use **ephemeral tokens** with Sid's instructions and tools locked in, so the API key never touches the browser. The browser streams 16 kHz mic audio through an AudioWorklet and screen frames at about 1 fps, then plays Sid's native voice back.
- **Function calling** in the live session: `highlight(box_2d, label)` draws the ring, `scam_alert` shows the red warning, `step_done` moves the progress list forward, and `ask_family` drafts a message
- **Gemini Flash with structured JSON output** for screenshot help: one call picks the mode and returns steps, a scam verdict and `box_2d` coordinates (0 to 1000), which we convert to pixels for the SVG overlay
- A **scam watchdog** on Flash-Lite. The live model only talks when spoken to, so when your screen changes we check it for scams and nudge Sid to speak up
- **Document Picture-in-Picture** to keep Sid floating over other apps, with an in-page fallback

## Challenges we ran into

- The live model won't speak unprompted, so proactive scam warnings needed a second, cheaper model watching for screen changes.
- Browsers suspend audio that starts after an `await`. We had to create the audio contexts synchronously inside the click, before the screen picker opens.
- If you only send frames when the screen changes, the live model "forgets" what it saw, so we stream steadily at 1 fps.
- Urdu Nastaliq needs much more line spacing than Latin text, or the letters collide.
- Free-tier quota limits during testing pushed us to build a model fallback chain.

## Accomplishments we're proud of

- The circle lands on the right button: in our tests it was pixel-accurate on mock-ups and on real sites like canada.ca and GitHub.
- Sid starts answering out loud about 1 to 2 seconds after you finish your question.
- He switches into natural spoken Urdu and draws labels in Urdu.
- It's a design we'd actually hand to our parents.

## What we learned

How to build safely on real-time multimodal APIs (ephemeral tokens, tool calls, interruptions), and how much accessibility depends on the small things: line height for each script, big tap targets, and captions for everything Sid says.

## What's next

Session resumption for longer calls, more languages (Punjabi, Tagalog, Mandarin), and an opt-in "check in on Mom" mode that sends a family member a summary.

## Built with

nextjs, typescript, tailwindcss, shadcn-ui, gemini-live-api, google-genai, vercel, web-audio-api, document-picture-in-picture

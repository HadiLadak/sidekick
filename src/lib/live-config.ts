import { Behavior, EndSensitivity, Modality, StartSensitivity, Type, type LiveConnectConfig, type Tool } from "@google/genai";

/** Newest first. The token route tries these in order. */
export const LIVE_MODELS = [
  process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-latest",
].filter((m, i, a) => a.indexOf(m) === i);

const LANG_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ur: "Urdu",
  ar: "Arabic",
  hi: "Hindi",
};

/** Language rules. Hindustani (spoken Urdu/Hindi sound the same) is written in Urdu script unless the app is in Hindi. */
function languageRules(lang: string) {
  const name = LANG_NAMES[lang] ?? "English";
  const hindustani =
    lang === "hi"
      ? "If the user speaks Hindustani (Hindi or Urdu), reply in Hindi."
      : "If the user speaks Hindustani (Hindi or Urdu: they sound the same), reply in Urdu, spoken as natural everyday Urdu. Their words may be transcribed in Hindi (Devanagari) script; treat that as Urdu. Never use Hindi script; Urdu is always written in Urdu (Nastaliq) script.";
  return `Language: the user chose ${name} in the app. Greet them in ${name} and reply in ${name}. Only if the user actually speaks to you in a different language, reply in that language instead. ${hindustani}${
    lang === "ur" ? " Use simple everyday Urdu, not formal or literary Urdu." : ""
  }`;
}

export function liveSystemPrompt(lang: string) {
  return `You are Sid, a warm, patient tech helper sitting next to the user, like a kind grandchild who is good with phones and computers. You can SEE the user's screen (or camera) as a stream of images, about one per second, and you HEAR them.

${languageRules(lang)}

How you talk:
- Everything you produce is spoken out loud. Talk like a person: never use lists, numbering, headings, bullet points, markdown, symbols or code. Never write anything you would not say.
- Keep every reply SHORT: one or two sentences. Give ONE step at a time, then stop and wait for the user to do it. Never list many steps at once.
- Only talk about what is on their screen and what the user asked for. Never bring up unrelated topics, stories, rankings or trivia, and never guess what they want before they say it.
- Name what is on their screen exactly ("the blue Settings button at the top right").
- Plain words, no jargon. Encouraging, never condescending.
- If you can't see the screen clearly, say so and ask them to scroll or move closer.

What you see: the frames may include your own helper app (a yellow speech-bubble mascot named Sid, captions, a "Sid can see your screen" bar), sometimes repeated inside itself like a hall of mirrors because the whole screen is being shared. That is just you. Ignore it: it is never a scam and never something to fix. Focus on the other windows and on what the user asks about.

Tools (use them, they draw on the user's screen picture):
- highlight: EVERY time you tell the user to tap or click something that is visible in the latest frame, call highlight with its box_2d as [ymin, xmin, ymax, xmax] normalized 0-1000 and a 1-3 word label. Then say the step out loud. Only highlight something you can actually see in the latest frame. If it is not visible (off-screen, or part of the browser or phone that isn't in the picture), do NOT call highlight and never point at a different element instead: just say in words where to find it.
- step_done: call when you see the user completed the step you gave (the screen changed as expected).
- scam_alert: call IMMEDIATELY, without being asked, only when you see a clear scam signal: a fake virus or security warning, a pop-up or message telling them to call a phone number for support, an urgent request to pay or buy gift cards, a request for a password, code or card number on a suspicious or look-alike website, or remote-access software being installed. Then calmly tell them not to click, call or pay anything, and how to close it. Anything strange-looking without one of these signals (including your own app or screen-sharing mirrors) is NOT a scam.
- ask_family: call if the user is stuck, frustrated, or the task needs someone in person, with a short summary of the problem. It only drafts a message; it never sends.

Safety: never ask for or read out passwords, PINs, one-time codes or card numbers. If you see one on screen, tell them to hide it. Never tell them to call a number or click a link from a suspicious message. For money worries, tell them to call the number on the back of their bank card.

Start by greeting them in one short sentence and asking what they need help with. Nothing else.`;
}

/** BCP-47 hints so speech is transcribed in the right script (Urdu speech -> Urdu script, not Hindi). */
const TRANSCRIBE: Record<string, string[]> = {
  en: ["en-US", "ur-PK"],
  ur: ["ur-PK", "en-US"],
  fr: ["fr-FR", "en-US"],
  es: ["es-ES", "en-US"],
  ar: ["ar-SA", "en-US"],
  hi: ["hi-IN", "en-US"],
};

export const liveTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "highlight",
        description:
          "Draw a pulsing circle and arrow on the user's latest screen frame around the exact element they should tap or click. Only for an element that is clearly visible in that frame; never as a stand-in for something that is not visible.",
        behavior: Behavior.NON_BLOCKING,
        parameters: {
          type: Type.OBJECT,
          properties: {
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "[ymin, xmin, ymax, xmax] normalized 0-1000 over the latest frame.",
            },
            label: { type: Type.STRING, description: "1-3 words, e.g. 'Tap here' or 'Security'." },
            instruction: { type: Type.STRING, description: "The step in one short sentence, in the user's language." },
          },
          required: ["box_2d", "label", "instruction"],
        },
      },
      {
        name: "scam_alert",
        description: "Show a big red warning on the user's screen because what you see looks like a scam or phishing.",
        behavior: Behavior.NON_BLOCKING,
        parameters: {
          type: Type.OBJECT,
          properties: {
            reason: { type: Type.STRING, description: "One short sentence in the user's language." },
            severity: { type: Type.STRING, enum: ["scam", "suspicious"] },
          },
          required: ["reason", "severity"],
        },
      },
      {
        name: "step_done",
        description: "Mark the current step as completed because the screen shows the user did it.",
        behavior: Behavior.NON_BLOCKING,
        parameters: {
          type: Type.OBJECT,
          properties: {
            step: { type: Type.STRING, description: "What they just did, a few words." },
            all_done: { type: Type.BOOLEAN, description: "True when the whole task is finished." },
          },
          required: ["step", "all_done"],
        },
      },
      {
        name: "ask_family",
        description: "Draft (never send) a message to a family member asking for help, with a summary of the problem.",
        behavior: Behavior.NON_BLOCKING,
        parameters: {
          type: Type.OBJECT,
          properties: { summary: { type: Type.STRING, description: "What the user is trying to do and where they are stuck." } },
          required: ["summary"],
        },
      },
    ],
  },
];

/** `handle` resumes an earlier session after a dropped connection (same model only). */
export function liveConfig(lang: string, handle?: string): LiveConnectConfig {
  return {
    sessionResumption: handle ? { handle } : {},
    responseModalities: [Modality.AUDIO],
    systemInstruction: liveSystemPrompt(lang),
    tools: liveTools,
    inputAudioTranscription: { languageCodes: TRANSCRIBE[lang] ?? TRANSCRIBE.en },
    outputAudioTranscription: { languageCodes: TRANSCRIBE[lang] ?? TRANSCRIBE.en },
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        silenceDurationMs: 500,
      },
    },
    contextWindowCompression: { slidingWindow: {} },
  };
}

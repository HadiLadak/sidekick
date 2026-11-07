import cache from "./demo-cache.json";
import type { Mode, SidResult } from "./types";

export interface Demo {
  id: string;
  label: string;
  prompt: string;
  image?: string;
  mode: Mode;
  lang: string;
  /** A real Sid answer saved earlier, used only if the live call fails. */
  cached?: SidResult;
}

const saved = cache as Record<string, SidResult>;

const list: Omit<Demo, "cached">[] = [
  {
    id: "scam-text",
    label: "Is this Canada Post text real?",
    prompt: "I got this text. Do I need to pay?",
    image: "/demos/scam-text.jpg",
    mode: "scam_check",
    lang: "en",
  },
  {
    id: "video-call",
    label: "How do I video call my grandson?",
    prompt: "How do I video call Ali?",
    image: "/demos/video-call.jpg",
    mode: "show_me",
    lang: "en",
  },
  {
    id: "virus-popup",
    label: "My computer says it has 5 viruses",
    prompt: "This popped up on my computer. Should I call them?",
    image: "/demos/virus-popup.jpg",
    mode: "scam_check",
    lang: "en",
  },
  {
    id: "storage-full",
    label: "My camera won't take photos",
    prompt: "My camera won't let me take pictures",
    image: "/demos/storage-full.jpg",
    mode: "fix_it",
    lang: "en",
  },
  {
    id: "wifi-settings",
    label: "Connect to the Wi-Fi",
    prompt: "How do I connect to my daughter's Wi-Fi?",
    image: "/demos/wifi-settings.jpg",
    mode: "show_me",
    lang: "en",
  },
  {
    id: "urdu-otp",
    label: "بینک کا کوڈ کیا ہوتا ہے؟",
    prompt: "کسی نے فون کر کے کہا کہ آپ کے فون پر جو کوڈ آیا ہے وہ بتا دیں۔ یہ کوڈ کیا ہوتا ہے؟",
    mode: "explain_it",
    lang: "ur",
  },
];

export const DEMOS: Demo[] = list.map((d) => ({ ...d, cached: saved[d.id] }));

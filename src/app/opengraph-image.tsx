import { ImageResponse } from "next/og";

export const alt = "Sid, your tech sidekick";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 64, padding: 80, background: "#f2f4fc", color: "#1b2452" }}>
        <svg width="340" height="340" viewBox="0 0 120 120">
          <path d="M22 12H98A14 14 0 0 1 112 26V78A14 14 0 0 1 98 92H48L27 109L31 92H22A14 14 0 0 1 8 78V26A14 14 0 0 1 22 12Z" fill="#ffd83d" stroke="#1b2452" strokeWidth="4" strokeLinejoin="round" />
          <ellipse cx="32" cy="64" rx="7" ry="4.5" fill="#ff8f7a" opacity="0.55" />
          <ellipse cx="88" cy="64" rx="7" ry="4.5" fill="#ff8f7a" opacity="0.55" />
          <ellipse cx="44" cy="46" rx="10" ry="12" fill="#fff" stroke="#1b2452" strokeWidth="3" />
          <ellipse cx="76" cy="46" rx="10" ry="12" fill="#fff" stroke="#1b2452" strokeWidth="3" />
          <circle cx="45" cy="48" r="5" fill="#1b2452" />
          <circle cx="77" cy="48" r="5" fill="#1b2452" />
          <path d="M47 66Q60 79 73 66" stroke="#1b2452" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>Hi, I&apos;m Sid.</div>
          <div style={{ fontSize: 44, lineHeight: 1.25, maxWidth: 620 }}>
            Your tech sidekick. I watch your screen, show you where to tap, and spot scams.
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 30, fontWeight: 700, background: "#ffd83d", padding: "12px 28px", borderRadius: 999, alignSelf: "flex-start", border: "4px solid #1b2452" }}>
            Speaks your language
          </div>
        </div>
      </div>
    ),
    size,
  );
}

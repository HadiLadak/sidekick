import { cn } from "@/lib/utils";

export type Mood = "helping" | "thinking" | "worried" | "celebrating";

const BODY =
  "M22 12H98A14 14 0 0 1 112 26V78A14 14 0 0 1 98 92H48L27 109L31 92H22A14 14 0 0 1 8 78V26A14 14 0 0 1 22 12Z";

/** Sid: a friendly speech-bubble sidekick. Decorative unless given a label. */
export function Sid({
  mood = "helping",
  className,
  label,
  animate = true,
}: {
  mood?: Mood;
  className?: string;
  label?: string;
  animate?: boolean;
}) {
  const look = mood === "thinking" ? { x: 3, y: -3 } : mood === "worried" ? { x: 0, y: 1 } : { x: 1, y: 1 };
  return (
    <svg
      viewBox="0 0 120 120"
      className={cn("shrink-0 overflow-visible", animate && mood !== "worried" && "sid-bob", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* soft shadow */}
      <ellipse cx="62" cy="114" rx="34" ry="4" fill="currentColor" opacity="0.08" />
      <path d={BODY} fill="var(--mark)" stroke="#1b2452" strokeWidth="4" strokeLinejoin="round" />
      {/* cheeks */}
      <ellipse cx="32" cy="64" rx="7" ry="4.5" fill="#ff8f7a" opacity={mood === "worried" ? 0.25 : 0.55} />
      <ellipse cx="88" cy="64" rx="7" ry="4.5" fill="#ff8f7a" opacity={mood === "worried" ? 0.25 : 0.55} />

      {mood === "celebrating" ? (
        <g stroke="#1b2452" strokeWidth="4.5" strokeLinecap="round" fill="none">
          <path d="M35 49Q44 37 53 49" />
          <path d="M67 49Q76 37 85 49" />
        </g>
      ) : (
        <g className={animate ? "sid-blink" : undefined}>
          <ellipse cx="44" cy="46" rx="10" ry="12" fill="#fff" stroke="#1b2452" strokeWidth="3" />
          <ellipse cx="76" cy="46" rx="10" ry="12" fill="#fff" stroke="#1b2452" strokeWidth="3" />
          <circle cx={44 + look.x} cy={47 + look.y} r="5" fill="#1b2452" />
          <circle cx={76 + look.x} cy={47 + look.y} r="5" fill="#1b2452" />
          <circle cx={46 + look.x} cy={45 + look.y} r="1.6" fill="#fff" />
          <circle cx={78 + look.x} cy={45 + look.y} r="1.6" fill="#fff" />
        </g>
      )}

      {mood === "helping" && (
        <path d="M47 66Q60 79 73 66" stroke="#1b2452" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      )}
      {mood === "thinking" && (
        <>
          <path d="M51 70Q58 66 68 69" stroke="#1b2452" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <path d="M66 30L84 27" stroke="#1b2452" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {mood === "worried" && (
        <>
          <g stroke="#1b2452" strokeWidth="3.5" strokeLinecap="round">
            <path d="M33 33L51 28" />
            <path d="M69 28L87 33" />
          </g>
          <path
            d="M45 72q5-6 10 0t10 0t10 0"
            stroke="#1b2452"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path d="M104 18q5 8 0 11q-5-3 0-11Z" fill="#7cc4ff" stroke="#1b2452" strokeWidth="2" />
        </>
      )}
      {mood === "celebrating" && (
        <>
          <path d="M46 62Q60 84 74 62Z" fill="#1b2452" stroke="#1b2452" strokeWidth="3" strokeLinejoin="round" />
          <path d="M53 70Q60 76 67 70" fill="#ff8f7a" />
          <g fill="var(--mark)" stroke="#1b2452" strokeWidth="2" strokeLinejoin="round">
            <path d="M4 6l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8Z" />
            <path d="M114 2l2 4 4.4.6-3.2 3.1.8 4.4-4-2.1-3.9 2.1.7-4.4-3.2-3.1 4.4-.6Z" />
          </g>
          <g stroke="#1b2452" strokeWidth="3" strokeLinecap="round">
            <path d="M118 40l7-3" />
            <path d="M117 52l8 1" />
            <path d="M2 42l-7-3" />
          </g>
        </>
      )}
    </svg>
  );
}

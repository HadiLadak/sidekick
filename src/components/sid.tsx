"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * helping: neutral and friendly (default). thinking: eyes wander, thought dots.
 * happy: safe or solved. worried: scam spotted. celebrating: the big moment.
 * Speaking: wrap Sid in .sid-talking and set --talk (0 to 1).
 */
export type Mood = "helping" | "thinking" | "happy" | "worried" | "celebrating";

const BODY =
  "M22 12H98A14 14 0 0 1 112 26V78A14 14 0 0 1 98 92H48L27 109L31 92H22A14 14 0 0 1 8 78V26A14 14 0 0 1 22 12Z";
const INK = "#1b2452";

/** Sid: a chunky, sticker-like speech bubble with a face. Decorative unless given a label. */
export function Sid({
  mood = "helping",
  className,
  label,
  animate = true,
  track = false,
}: {
  mood?: Mood;
  className?: string;
  label?: string;
  animate?: boolean;
  /** Eyes follow the pointer (use on one big Sid per screen) */
  track?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!track || !svg || !animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = svg.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.4);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 300) * 3.2;
        svg.style.setProperty("--lx", `${((dx / d) * k).toFixed(2)}px`);
        svg.style.setProperty("--ly", `${((dy / d) * k).toFixed(2)}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [track, animate]);

  const happyEyes = mood === "happy" || mood === "celebrating";
  const rest = mood === "worried" ? { x: 0, y: 1.5 } : { x: 0.5, y: 1 };
  const g = (name: string) => `url(#${name}${id})`;

  return (
    <svg
      ref={ref}
      viewBox="0 0 120 120"
      className={cn(
        "sid shrink-0 overflow-visible",
        animate && "sid-alive",
        animate && (mood === "celebrating" ? "sid-hop" : mood === "worried" ? "sid-shiver" : "sid-bob"),
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <radialGradient id={`body${id}`} cx="0.3" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.38" stopColor="#ffdd4d" />
          <stop offset="1" stopColor="#f3b80d" />
        </radialGradient>
        <linearGradient id={`side${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0a100" />
          <stop offset="1" stopColor="#b98200" />
        </linearGradient>
        <radialGradient id={`eye${id}`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0.55" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe4fb" />
        </radialGradient>
        <radialGradient id={`cheek${id}`}>
          <stop offset="0" stopColor="#ff7f6b" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ff7f6b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`floor${id}`}>
          <stop offset="0" stopColor={INK} stopOpacity="0.28" />
          <stop offset="1" stopColor={INK} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`clip${id}`}>
          <path d={BODY} />
        </clipPath>
      </defs>

      {/* floor shadow (stays put while Sid bobs, so it reads as height) */}
      <ellipse className="sid-floor" cx="62" cy="116" rx="38" ry="5" fill={g("floor")} />

      <g className="sid-figure">
      <g className="sid-tilt">
        {/* the "thickness": a darker copy pushed down-right, like a die-cut sticker on foam */}
        <path d={BODY} transform="translate(3.5 4.5)" fill={g("side")} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        <path d={BODY} fill={g("body")} />
        <g clipPath={g("clip")}>
          {/* lower shade and a glossy top-left highlight give the face some volume */}
          <ellipse cx="66" cy="100" rx="64" ry="20" fill="#d99a00" opacity="0.35" />
          <ellipse cx="34" cy="21" rx="20" ry="4.5" fill="#fff" opacity="0.7" transform="rotate(-8 34 21)" />
          <circle cx="60" cy="19" r="2" fill="#fff" opacity="0.7" />
        </g>
        <path d={BODY} fill="none" stroke={INK} strokeWidth="4" strokeLinejoin="round" />

        <ellipse cx="31" cy="65" rx="9" ry="6" fill={g("cheek")} opacity={mood === "worried" ? 0.35 : 1} />
        <ellipse cx="89" cy="65" rx="9" ry="6" fill={g("cheek")} opacity={mood === "worried" ? 0.35 : 1} />

        {happyEyes ? (
          <g stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none">
            <path d="M35 49Q44 37 53 49" />
            <path d="M67 49Q76 37 85 49" />
          </g>
        ) : (
          <g className={animate ? "sid-blink" : undefined}>
            <ellipse cx="44" cy="46" rx="10" ry="12" fill={g("eye")} stroke={INK} strokeWidth="3" />
            <ellipse cx="76" cy="46" rx="10" ry="12" fill={g("eye")} stroke={INK} strokeWidth="3" />
            <g className={cn(animate && mood === "thinking" ? "sid-look-around" : animate && track ? "sid-look" : undefined)}>
              <g transform={`translate(${rest.x} ${rest.y})`}>
                <circle cx="44" cy="46" r={mood === "worried" ? 4.2 : 5.2} fill={INK} />
                <circle cx="76" cy="46" r={mood === "worried" ? 4.2 : 5.2} fill={INK} />
                <circle cx="46.2" cy="43.8" r="1.8" fill="#fff" />
                <circle cx="78.2" cy="43.8" r="1.8" fill="#fff" />
              </g>
            </g>
          </g>
        )}

        {/* speaking mouth: shown only inside .sid-talking, scaled by --talk */}
        {mood !== "celebrating" && <ellipse className="sid-mouth-talk" cx="60" cy="70" rx="9" ry="8" fill={INK} />}

        {mood === "helping" && (
          <path className="sid-mouth" d="M47 66Q60 79 73 66" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
        )}
        {mood === "thinking" && (
          <>
            <path className="sid-mouth" d="M51 70Q58 66 68 69" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <path d="M66 30L84 26" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
            <g fill="currentColor">
              <circle className={animate ? "dot" : undefined} cx="104" cy="4" r="3" />
              <circle className={animate ? "dot" : undefined} style={{ animationDelay: "0.15s" }} cx="113" cy="-4" r="3.5" />
              <circle className={animate ? "dot" : undefined} style={{ animationDelay: "0.3s" }} cx="124" cy="-14" r="4" />
            </g>
          </>
        )}
        {mood === "happy" && (
          <g className="sid-mouth">
            <path d="M45 63Q60 83 75 63Z" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            <path d="M52 71Q60 77 68 71" fill="#ff8f7a" />
          </g>
        )}
        {mood === "worried" && (
          <>
            <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
              <path d="M33 31L51 27" />
              <path d="M69 27L87 31" />
            </g>
            <path
              className="sid-mouth"
              d="M45 72q5-6 10 0t10 0t10 0"
              stroke={INK}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path className={animate ? "sid-drip" : undefined} d="M104 18q5 8 0 11q-5-3 0-11Z" fill="#7cc4ff" stroke={INK} strokeWidth="2" />
          </>
        )}
        {mood === "celebrating" && (
          <>
            <path d="M44 62Q60 86 76 62Z" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            <path d="M52 71Q60 78 68 71" fill="#ff8f7a" />
          </>
        )}
      </g>
      </g>

      {mood === "celebrating" && (
        <>
          <g fill="var(--mark)" stroke={INK} strokeWidth="2" strokeLinejoin="round" className={animate ? "sid-twinkle" : undefined}>
            <path d="M4 6l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8Z" />
            <path d="M114 2l2 4 4.4.6-3.2 3.1.8 4.4-4-2.1-3.9 2.1.7-4.4-3.2-3.1 4.4-.6Z" />
          </g>
          <g stroke={INK} strokeWidth="3" strokeLinecap="round">
            <path d="M118 40l7-3" />
            <path d="M117 52l8 1" />
            <path d="M2 42l-7-3" />
          </g>
        </>
      )}
    </svg>
  );
}

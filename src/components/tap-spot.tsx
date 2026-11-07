"use client";

import { useId } from "react";
import { boxToPixels } from "@/lib/image";
import { cn } from "@/lib/utils";

/** Phone screenshots are tall; computer screenshots are wide. */
export const isPhoneShot = (width: number, height: number) => height > width * 1.15;

/**
 * The signature view: the user's screenshot with a highlighter ring and a hand-drawn
 * arrow pointing at exactly what to tap or click. Everything is one SVG in the image's
 * own pixel space (converted from Gemini's 0–1000 box_2d), so it scales with the picture.
 * When the ring, arrow or label would spill past an edge, a dark bezel grows around the
 * screenshot so nothing is ever cut off.
 */
export function TapSpot({
  src,
  width,
  height,
  box,
  label,
  hereText,
  alt,
  tone = "mark",
  className,
}: {
  src: string;
  width: number;
  height: number;
  box?: number[];
  /** Explicit label (e.g. the button's name). Otherwise "Tap here" / "Click here". */
  label?: string;
  hereText: { tap: string; click: string };
  alt: string;
  tone?: "mark" | "safe";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const px = box ? boxToPixels(box, width, height) : null;
  const u = Math.max(width, height * 0.6) / 100; // drawing unit that reads well on phones and desktops
  const ringColor = tone === "safe" ? "#21a36a" : "var(--mark)";
  const text = label || (isPhoneShot(width, height) ? hereText.tap : hereText.click);

  let pad = 0;
  let overlay = null;
  if (px) {
    // Ellipse that hugs the target: round for icons, wide for list rows and buttons.
    const rx = Math.max(px.w * 0.62 + u * 1.6, u * 5.5);
    const ry = Math.max(px.h * 0.62 + u * 1.6, u * 5.5);
    const stroke = u * 1.6; // half of the widest ring stroke, plus pulse room

    // Arrow comes from the roomier side, angled toward the middle of the screen.
    const fromAbove = px.cy > height * 0.32;
    const sx = px.cx < width / 2 ? 1 : -1;
    const dist = ry + u * 16;
    let tx = px.cx + sx * u * 14;
    let ty = px.cy + (fromAbove ? -dist : dist);
    tx = Math.min(width - u * 4, Math.max(u * 4, tx));
    ty = Math.min(height - u * 6, Math.max(u * 6, ty));
    const ang = Math.atan2(px.cy - ty, px.cx - tx);
    // Distance from the centre to the ellipse edge along the arrow's angle
    const edge = (rx * ry) / Math.hypot(ry * Math.cos(ang), rx * Math.sin(ang));
    const hx = px.cx - Math.cos(ang) * (edge + u * 1.4);
    const hy = px.cy - Math.sin(ang) * (edge + u * 1.4);
    const mx = (tx + hx) / 2 + Math.sin(ang) * u * 5 * sx;
    const my = (ty + hy) / 2 - Math.cos(ang) * u * 5 * sx;
    const headAng = Math.atan2(hy - my, hx - mx);
    const hl = u * 3.6;
    const head = `M${hx - Math.cos(headAng - 0.5) * hl} ${hy - Math.sin(headAng - 0.5) * hl}L${hx} ${hy}L${
      hx - Math.cos(headAng + 0.5) * hl
    } ${hy - Math.sin(headAng + 0.5) * hl}`;
    const fs = u * 5.6;
    const labelY = fromAbove ? ty - fs * 0.5 : ty + fs * 1.2;
    const half = Math.min(width / 2 - u * 2, (text.length * fs * 0.56) / 2 + u * 2);
    const labelX = Math.min(width - half, Math.max(half, tx));

    // How far does anything poke past the screenshot? Grow the bezel by that much.
    const minX = Math.min(px.cx - rx - stroke, labelX - half);
    const maxX = Math.max(px.cx + rx + stroke, labelX + half);
    const minY = Math.min(px.cy - ry - stroke, labelY - fs);
    const maxY = Math.max(px.cy + ry + stroke, labelY + fs * 0.35);
    const over = Math.max(0, -minX, -minY, maxX - width, maxY - height);
    pad = over > 0 ? over + u : 0;

    const outline = (
      <ellipse cx={px.cx} cy={px.cy} rx={rx} ry={ry} />
    );
    overlay = (
      <g aria-hidden="true">
        <defs>
          <mask id={`dim-${id}`}>
            <rect width={width} height={height} fill="white" />
            <ellipse cx={px.cx} cy={px.cy} rx={rx} ry={ry} fill="black" />
          </mask>
        </defs>
        {/* very light dim outside the spot, so the screenshot stays readable */}
        <rect width={width} height={height} fill="#0b1030" opacity="0.12" mask={`url(#dim-${id})`} />
        <g className="tap-ring-pulse" fill="none" stroke={ringColor} strokeWidth={u * 2.2}>
          {outline}
        </g>
        <g fill="none" stroke="#1b2452" strokeWidth={u * 2.6}>
          {outline}
        </g>
        <g fill="none" stroke={ringColor} strokeWidth={u * 1.5}>
          {outline}
        </g>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${tx} ${ty}Q${mx} ${my} ${hx} ${hy}`} stroke="#1b2452" strokeWidth={u * 2.4} />
          <path d={head} stroke="#1b2452" strokeWidth={u * 2.4} />
          <path
            className="draw-in"
            d={`M${tx} ${ty}Q${mx} ${my} ${hx} ${hy}`}
            stroke={ringColor}
            strokeWidth={u * 1.1}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="1"
          />
          <path d={head} stroke={ringColor} strokeWidth={u * 1.1} />
        </g>
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fontSize={fs}
          fontWeight={700}
          style={{ fontFamily: "var(--font-hand)", paintOrder: "stroke" }}
          fill="#1b2452"
          stroke={tone === "safe" ? "#d6f5e5" : ringColor}
          strokeWidth={u * 1.6}
          strokeLinejoin="round"
        >
          {text}
        </text>
      </g>
    );
  }

  const W = width + pad * 2;
  const H = height + pad * 2;
  return (
    <figure
      className={cn(
        "relative mx-auto w-fit max-w-full overflow-hidden rounded-[1.25rem] border-4 border-ink bg-[#1b2452] shadow-[0_0.5rem_0_0_var(--surface-2)] dark:border-line",
        className,
      )}
    >
      <svg
        viewBox={`${-pad} ${-pad} ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={px ? `${alt}. ${text}` : alt}
        className="tap-media block h-auto max-h-[68vh] w-auto max-w-full"
      >
        <image href={src} width={width} height={height} />
        {overlay}
      </svg>
    </figure>
  );
}

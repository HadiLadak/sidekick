"use client";

import { useId } from "react";
import { boxToPixels } from "@/lib/image";
import { cn } from "@/lib/utils";

/**
 * The signature view: the user's screenshot with a highlighter ring and a hand-drawn
 * arrow pointing at exactly what to tap. Coordinates are in the image's own pixels
 * (converted from Gemini's 0–1000 box_2d), so the overlay scales with the image.
 */
export function TapSpot({
  src,
  width,
  height,
  box,
  label,
  alt,
  tone = "mark",
  className,
}: {
  src: string;
  width: number;
  height: number;
  box?: number[];
  label: string;
  alt: string;
  tone?: "mark" | "safe";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const px = box ? boxToPixels(box, width, height) : null;
  const u = Math.max(width, height * 0.6) / 100; // drawing unit that reads well on phones and desktops
  const ringColor = tone === "safe" ? "#21a36a" : "var(--mark)";

  let overlay = null;
  if (px) {
    const r = Math.max(Math.hypot(px.w, px.h) / 2 + u * 1.6, u * 5.5);
    // Arrow comes from the roomier side, angled toward the middle of the screen.
    const fromAbove = px.cy > height * 0.32;
    const sx = px.cx < width / 2 ? 1 : -1;
    const dist = r + u * 16;
    let tx = px.cx + sx * u * 14;
    let ty = px.cy + (fromAbove ? -dist : dist);
    tx = Math.min(width - u * 4, Math.max(u * 4, tx));
    ty = Math.min(height - u * 6, Math.max(u * 6, ty));
    const ang = Math.atan2(px.cy - ty, px.cx - tx);
    const hx = px.cx - Math.cos(ang) * (r + u * 1.4);
    const hy = px.cy - Math.sin(ang) * (r + u * 1.4);
    const mx = (tx + hx) / 2 + Math.sin(ang) * u * 5 * sx;
    const my = (ty + hy) / 2 - Math.cos(ang) * u * 5 * sx;
    const headAng = Math.atan2(hy - my, hx - mx);
    const hl = u * 3.6;
    const head = `M${hx - Math.cos(headAng - 0.5) * hl} ${hy - Math.sin(headAng - 0.5) * hl}L${hx} ${hy}L${
      hx - Math.cos(headAng + 0.5) * hl
    } ${hy - Math.sin(headAng + 0.5) * hl}`;
    const fs = u * 5.6;
    const labelY = fromAbove ? ty - fs * 0.5 : ty + fs * 1.2;
    const half = Math.min(width / 2 - u * 2, (label.length * fs * 0.56) / 2 + u * 2);
    const labelX = Math.min(width - half, Math.max(half, tx));

    overlay = (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <mask id={`dim-${id}`}>
            <rect width={width} height={height} fill="white" />
            <circle cx={px.cx} cy={px.cy} r={r} fill="black" />
          </mask>
        </defs>
        {/* gently dim everything except the spot */}
        <rect width={width} height={height} fill="#0b1030" opacity="0.28" mask={`url(#dim-${id})`} />
        <circle
          className="tap-ring-pulse"
          cx={px.cx}
          cy={px.cy}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={u * 2.2}
        />
        <circle cx={px.cx} cy={px.cy} r={r} fill="none" stroke="#1b2452" strokeWidth={u * 2.6} />
        <circle cx={px.cx} cy={px.cy} r={r} fill="none" stroke={ringColor} strokeWidth={u * 1.5} />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d={`M${tx} ${ty}Q${mx} ${my} ${hx} ${hy}`}
            stroke="#1b2452"
            strokeWidth={u * 2.4}
          />
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
          stroke={ringColor}
          strokeWidth={u * 1.6}
          strokeLinejoin="round"
        >
          {label}
        </text>
      </svg>
    );
  }

  return (
    <figure
      className={cn(
        "relative mx-auto w-fit max-w-full overflow-hidden rounded-[1.25rem] border-4 border-ink bg-ink shadow-[0_0.5rem_0_0_var(--surface-2)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL */}
      <img
        src={src}
        width={width}
        height={height}
        alt={alt}
        className="block h-auto max-h-[68vh] w-auto max-w-full"
        draggable={false}
      />
      {overlay}
    </figure>
  );
}

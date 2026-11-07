"use client";

import { useEffect, useId, useState } from "react";
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
  const busy = useBusyGrid(px ? src : null);
  const u = Math.max(width, height * 0.6) / 100; // drawing unit that reads well on phones and desktops
  const ringColor = tone === "safe" ? "#21a36a" : "var(--mark)";
  const text = label || (isPhoneShot(width, height) ? hereText.tap : hereText.click);

  let pad = 0;
  let overlay = null;
  if (px) {
    // Ellipse that hugs the target: round for icons, wide for list rows and buttons.
    // An ellipse needs radii > box dimension / sqrt(2) to enclose its corners.
    const rx = Math.max(px.w * 0.8 + u * 1.6, u * 5.5);
    const ry = Math.max(px.h * 0.8 + u * 1.6, u * 5.5);
    const stroke = u * 1.6; // half of the widest ring stroke, plus pulse room

    // Where do the label and the arrow's tail go? Try eight spots around the target and pick the
    // one that keeps the label off the target's own row (the text right next to it), off busy
    // parts of the screenshot, and inside the picture.
    const fs = u * 5.6;
    const half = Math.min(width / 2 - u * 2, (text.length * fs * 0.56) / 2 + u * 2);
    const spot = placeLabel({ px, rx, ry, u, fs, half, width, height, busy });
    const { tx, ty, labelX, labelY } = spot;
    const sx = tx < px.cx ? 1 : -1;
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

type Busy = { cols: number; rows: number; data: Float32Array };

/** How "busy" (text, edges) each part of the screenshot is, on a coarse grid. */
function useBusyGrid(src: string | null): Busy | null {
  const [grid, setGrid] = useState<{ src: string; busy: Busy } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const cols = 48;
      const rows = Math.max(8, Math.round((cols * img.naturalHeight) / img.naturalWidth));
      const cw = cols * 4;
      const ch = rows * 4;
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, cw, ch);
      const px = ctx.getImageData(0, 0, cw, ch).data;
      const data = new Float32Array(cols * rows);
      for (let gy = 0; gy < rows; gy++)
        for (let gx = 0; gx < cols; gx++) {
          let sum = 0;
          let sq = 0;
          for (let y = 0; y < 4; y++)
            for (let x = 0; x < 4; x++) {
              const i = ((gy * 4 + y) * cw + gx * 4 + x) * 4;
              const l = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
              sum += l;
              sq += l * l;
            }
          data[gy * cols + gx] = Math.sqrt(Math.max(0, sq / 16 - (sum / 16) ** 2)); // local contrast
        }
      setGrid({ src, busy: { cols, rows, data } });
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return grid && grid.src === src ? grid.busy : null;
}

const DIRS: [number, number][] = [
  [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7], [0, -1], [0, 1], [-1, 0], [1, 0],
];

/** Picks where the label (and the arrow's tail) go. Exported for tests. */
export function placeLabel({
  px,
  rx,
  ry,
  u,
  fs,
  half,
  width,
  height,
  busy,
}: {
  px: { cx: number; cy: number; w: number; h: number };
  rx: number;
  ry: number;
  u: number;
  fs: number;
  half: number;
  width: number;
  height: number;
  busy: Busy | null;
}) {
  // The target's own row: the words right beside it are what people need to read
  const rowTop = px.cy - px.h / 2 - u * 2;
  const rowBottom = px.cy + px.h / 2 + u * 2;
  let best: { tx: number; ty: number; labelX: number; labelY: number; score: number } | null = null;
  for (const [i, [dx, dy]] of DIRS.entries()) {
    const reach = Math.hypot(dx * rx, dy * ry) + u * 14;
    let tx = px.cx + dx * reach;
    let ty = px.cy + dy * reach;
    tx = Math.min(width - u * 3, Math.max(u * 3, tx));
    ty = Math.min(height - u * 4, Math.max(u * 4, ty));
    // Label sits beyond the tail, away from the target
    const labelX = dy === 0 ? tx + dx * half : tx;
    const labelY = dy < 0 ? ty - fs * 0.45 : dy > 0 ? ty + fs * 1.15 : ty + fs * 0.35;
    const box = { l: labelX - half, r: labelX + half, t: labelY - fs, b: labelY + fs * 0.3 };

    let score = i * 0.01; // stable tie-break: diagonals first
    const outside = Math.max(0, -box.l) + Math.max(0, box.r - width) + Math.max(0, -box.t) + Math.max(0, box.b - height);
    score += (outside / u) * 3;
    if (box.b > rowTop && box.t < rowBottom) score += 40; // covers the target's row
    const ring = { l: px.cx - rx, r: px.cx + rx, t: px.cy - ry, b: px.cy + ry };
    if (box.l < ring.r && box.r > ring.l && box.t < ring.b && box.b > ring.t) score += 100; // covers the ring
    if (busy) {
      const gx0 = Math.max(0, Math.floor((box.l / width) * busy.cols));
      const gx1 = Math.min(busy.cols - 1, Math.floor((box.r / width) * busy.cols));
      const gy0 = Math.max(0, Math.floor((box.t / height) * busy.rows));
      const gy1 = Math.min(busy.rows - 1, Math.floor((box.b / height) * busy.rows));
      let sum = 0;
      let n = 0;
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++) {
          sum += busy.data[gy * busy.cols + gx];
          n++;
        }
      if (n) score += sum / n / 4; // ~0 on plain areas, 10+ over text
    }
    if (!best || score < best.score) best = { tx, ty, labelX, labelY, score };
  }
  return best!;
}

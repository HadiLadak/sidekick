export interface PreparedImage {
  /** data: URL for display */
  url: string;
  /** base64 payload without the data: prefix */
  data: string;
  mimeType: string;
  width: number;
  height: number;
}

const MAX_SIDE = 1600;

/** Downscale to keep uploads small (Vercel body limit) while keeping detail for box detection. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    // Fallback for formats createImageBitmap can't decode directly
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  const w0 = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h0 = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const url = canvas.toDataURL("image/jpeg", 0.86);
  return { url, data: url.split(",")[1], mimeType: "image/jpeg", width, height };
}

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** Gemini box_2d is [ymin, xmin, ymax, xmax] normalized to 0–1000. Convert to image pixels. */
export function boxToPixels(box: number[], width: number, height: number): PixelBox | null {
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || width <= 0 || height <= 0) return null;
  let [ymin, xmin, ymax, xmax] = box;
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  ymin = Math.max(0, Math.min(1000, ymin));
  ymax = Math.max(0, Math.min(1000, ymax));
  xmin = Math.max(0, Math.min(1000, xmin));
  xmax = Math.max(0, Math.min(1000, xmax));
  if (ymax - ymin < 1 || xmax - xmin < 1) return null;
  const x = (xmin / 1000) * width;
  const y = (ymin / 1000) * height;
  const w = ((xmax - xmin) / 1000) * width;
  const h = ((ymax - ymin) / 1000) * height;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

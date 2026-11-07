/** Receives "why did the live connection close" reports from the browser and logs them. */
export async function POST(request: Request) {
  const text = (await request.text().catch(() => "")).slice(0, 500);
  console.warn(`[live-close] ${text.replace(/[^\x20-\x7e]/g, "?")}`);
  return new Response(null, { status: 204 });
}

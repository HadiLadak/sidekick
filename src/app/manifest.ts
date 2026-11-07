import type { MetadataRoute } from "next";

/** Lets people add Sid to their home screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sid, your tech sidekick",
    short_name: "Sid",
    description: "Send Sid a screenshot or ask a question. Sid shows you where to tap, spots scams and explains tech in plain words.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4fc",
    theme_color: "#1b2452",
    categories: ["utilities", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

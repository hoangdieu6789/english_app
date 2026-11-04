// Web app manifest: icon + name when the app is added to a phone home screen.
// Tab icons come from the Next.js file convention: app/favicon.ico, icon.svg, apple-icon.png
// (the same files as the David Studio hub and vim-practice).
import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — Speak with a spark.`,
    short_name: APP_NAME,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#282a36",
    theme_color: "#282a36",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

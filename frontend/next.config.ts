import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants"

export default function config(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER
  // POS_STATIC_EXPORT=1 builds plain HTML/JS/CSS files into out/ for the Windows 7 package, where the
  // Django backend serves the screens itself and no Node.js server runs on the pharmacy PC.
  const staticExport = process.env.POS_STATIC_EXPORT === "1"

  return {
    // Prerendering features that need a running Next.js server are off in the static export.
    cacheComponents: !staticExport,
    partialPrefetching: !staticExport,
    ...(staticExport && {
      output: "export" as const,
      trailingSlash: true, // pos/index.html, served at /pos/
      images: { unoptimized: true },
    }),
    // Don't advertise the framework in response headers.
    poweredByHeader: false,
    // Dev-only: App pages render client-side behind AuthGuard (JWT in localStorage), so the server
    // prerender only ever sees the auth spinner and automatic instant-navigation validation would
    // report every page as "dropped from rendering". Production builds carry no experimental flags.
    ...(isDev && {
      experimental: {
        instantInsights: {
          validationLevel: "manual-warning",
        },
      },
    }),
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  }
}

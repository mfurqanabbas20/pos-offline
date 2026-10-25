import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants"

export default function config(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER

  return {
    cacheComponents: true,
    partialPrefetching: true,
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

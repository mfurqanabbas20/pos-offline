import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // App pages render client-side behind AuthGuard (JWT in localStorage), so the server prerender
    // only ever sees the auth spinner. Automatic per-page instant-navigation validation would just
    // report every page as "dropped from rendering"; validate only segments that opt in via `instant`.
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

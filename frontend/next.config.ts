import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Folder ini berada di dalam proyek Laravel yang punya package-lock.json
    // dan postcss.config.js (Tailwind 3) sendiri. Tanpa root yang dikunci,
    // Next.js ikut membaca konfigurasi Laravel itu dan build gagal.
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

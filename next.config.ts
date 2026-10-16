import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // `exceljs` menulis .xlsx lewat stream & zip bawaan Node, jadi jangan
  // di-bundle: biarkan di-`require` apa adanya oleh runtime server.
  serverExternalPackages: ["exceljs"],
  partialPrefetching: true,
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

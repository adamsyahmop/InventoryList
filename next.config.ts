import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Artefak produksi mandiri: `.next/standalone/server.js` + node_modules yang
  // benar-benar dipakai. Ini yang dibungkus `Dockerfile` (lihat README bagian
  // Deploy) — tanpa ini image harus membawa seluruh node_modules dan Prisma CLI.
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
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

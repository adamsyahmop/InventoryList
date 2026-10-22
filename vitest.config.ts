import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit test untuk fungsi murni (tanpa server, tanpa database).
 *
 * Yang diuji di sini sengaja bukan halaman atau Server Action — itu wilayah
 * `smoke.ps1` yang menjalankan aplikasi sungguhan. Pembagian tugasnya:
 *
 * - `npm test`  → cepat (< 2 detik), menunjuk fungsi dan kasus yang salah.
 * - `smoke.ps1` → lambat, membuktikan aplikasi benar-benar jalan.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Zona waktu dipaku supaya hasil `format*` tidak berubah di runner CI
    // (format tanggal memakai Asia/Jakarta, bukan zona mesin).
    env: { TZ: "Asia/Jakarta" },
  },
});

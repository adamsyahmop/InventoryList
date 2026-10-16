"use client";

import { ErrorFallback } from "@/components/ui/error-fallback";

/**
 * Boundary error di dalam rangka aplikasi.
 *
 * Sengaja dipisah dari `app/error.tsx`: boundary di segmen akar berada di ATAS
 * `(app)/layout.tsx`, jadi navbar & footer ikut tergantikan dan pengguna tidak
 * punya jalan keluar selain memuat ulang halaman. Di sini shell tetap tampil.
 *
 * Tidak perlu pembungkus `<main>` — `(app)/layout.tsx` sudah menyediakannya.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorFallback error={error} retry={retry} />;
}

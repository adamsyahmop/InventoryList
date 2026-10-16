"use client";

import { ErrorFallback } from "@/components/ui/error-fallback";

/**
 * Boundary error untuk segmen akar, yaitu `/login` dan seluruh grup `(app)`.
 *
 * Catatan: `error.tsx` TIDAK membungkus `layout.tsx` di segmen yang sama. Jadi
 * kalau `app/layout.tsx` sendiri yang gagal, yang tampil adalah
 * `app/global-error.tsx`.
 *
 * Halaman di dalam rangka aplikasi punya boundary sendiri di
 * `app/(app)/error.tsx` supaya navbar tidak ikut hilang.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-16 sm:px-6">
      <div className="w-full">
        <ErrorFallback error={error} retry={retry} />
      </div>
    </main>
  );
}

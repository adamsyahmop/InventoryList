"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/card";

/**
 * Isi bersama untuk boundary error di `error.tsx`.
 *
 * `retry()` (stabil sejak Next 16.3) merender ulang segmen yang gagal tanpa
 * memuat ulang seluruh dokumen, jadi cache dan state di luar segmen tetap utuh.
 */
export function ErrorFallback({
  error,
  retry,
  title = "Terjadi kesalahan",
  description = "Halaman ini gagal dimuat. Coba lagi; kalau tetap gagal, periksa koneksi database.",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    // Dicatat ke console supaya tetap bisa dilacak walau UI sudah digantikan.
    console.error(error);
  }, [error]);

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="flex flex-col gap-3">
        <Alert tone="error">
          <p className="font-medium">{error.message || "Kesalahan tanpa pesan."}</p>
          {error.digest ? (
            <p className="mt-1 font-mono text-xs opacity-80">
              Kode kejadian: {error.digest}
            </p>
          ) : null}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => retry()}>Coba lagi</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Muat ulang halaman
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

"use client";

import { Button } from "@/components/ui/button";

/**
 * Tombol cetak label. Dipisah sebagai komponen klien karena `window.print()`
 * hanya tersedia di browser, sedangkan halaman label sendiri dirender server.
 */
export function PrintButton({ label = "Cetak label" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      {label}
    </Button>
  );
}

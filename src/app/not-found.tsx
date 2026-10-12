import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";

export const metadata: Metadata = { title: "Halaman tidak ditemukan" };

/**
 * Fallback 404 global untuk URL yang tidak cocok dengan rute mana pun.
 *
 * Berbeda dengan `(app)/layout.tsx`, file ini dirender hanya di dalam
 * `app/layout.tsx`, jadi kerangka navigasi aplikasi tidak tersedia dan
 * pembungkusnya dibuat mandiri.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-16 sm:px-6">
      <div className="w-full">
        <EmptyState
          title="Halaman tidak ditemukan"
          description="Alamat yang kamu buka tidak tersedia di aplikasi inventaris ini."
          action={<ButtonLink href="/">Kembali ke dashboard</ButtonLink>}
        />
      </div>
    </main>
  );
}

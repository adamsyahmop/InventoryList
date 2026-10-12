import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";

/**
 * Boundary not-found untuk `/items/[id]` dan segmen turunannya
 * (`/items/[id]/edit`).
 *
 * Catatan penting: `notFound()` dipanggil di dalam `<Suspense>`, jadi shell
 * sudah ter-stream lebih dulu dan **status HTTP tetap 200** — ini perilaku
 * resmi Next.js, bukan bug. Lihat
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`.
 * Next.js otomatis menyuntikkan `<meta name="robots" content="noindex" />`
 * pada respons tersebut.
 */
export default function ItemNotFound() {
  return (
    <EmptyState
      title="Barang tidak ditemukan"
      description="Barang yang kamu cari tidak ada atau sudah dihapus dari daftar aktif. Periksa kembali tautannya, atau kembali ke daftar barang."
      action={<ButtonLink href="/items">Kembali ke daftar barang</ButtonLink>}
    />
  );
}

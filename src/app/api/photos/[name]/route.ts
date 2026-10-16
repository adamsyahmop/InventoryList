import type { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readUploadedPhoto } from "@/lib/photos";

/**
 * Menyajikan berkas foto barang dari `uploads/items` (lihat `src/lib/photos.ts`).
 *
 * PENTING: matcher di `proxy.ts` melewatkan URL berakhiran ekstensi gambar
 * (`*.jpg`, `*.png`, …) supaya aset statis tidak ikut dicek, jadi permintaan ke
 * rute ini TIDAK lewat proxy dan pemeriksaan sesi wajib dilakukan di sini —
 * sama seperti rute ekspor Excel yang juga memeriksa `isAuthenticated()`.
 *
 * Nama berkas dibatasi pola UUID + ekstensi (lihat `readUploadedPhoto`), jadi
 * `../` atau path absolut tidak akan pernah terbaca.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { name } = await context.params;
  const photo = await readUploadedPhoto(name);
  if (!photo) return new Response("Not Found", { status: 404 });

  return new Response(photo.bytes, {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.bytes.byteLength),
      // Nama berkas unik per unggahan dan isinya tidak pernah berubah, jadi
      // aman di-cache lama di browser. Tetap `private` supaya tidak ikut cache
      // bersama/CDN.
      "Cache-Control": "private, max-age=31536000, immutable",
      // Jenis berkas sudah ditentukan server dari magic bytes; larang browser
      // menebak-nebak sendiri.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

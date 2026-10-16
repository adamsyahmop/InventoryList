import { isAuthenticated } from "@/lib/auth";
import { buildInventoryWorkbook, XLSX_CONTENT_TYPE } from "@/lib/excel";
import { prisma } from "@/lib/prisma";
import { ITEM_INCLUDE } from "@/lib/queries";

/**
 * Ekspor seluruh barang aktif ke satu berkas Excel: sheet `Ringkasan` berisi
 * rekap per tahun, lalu satu sheet per **tahun pada kode barang**
 * (`INV-2026-…` → sheet `2026`). Barang yang sudah dihapus (soft delete) tidak
 * ikut, sama seperti ekspor CSV sebelumnya.
 *
 * Catatan: `exceljs` menyusun .xlsx lewat zip/stream milik Node, jadi rute ini
 * hanya boleh jalan di runtime Node. Segment config `runtime` tidak dipakai
 * karena `cacheComponents` di `next.config.ts` melarangnya — runtime Node sudah
 * menjadi default untuk route handler.
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const items = await prisma.item.findMany({
    where: { deletedAt: null },
    include: ITEM_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  const bytes = await buildInventoryWorkbook(items);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(bytes, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="inventaris-${stamp}.xlsx"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

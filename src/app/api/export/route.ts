import { isAuthenticated } from "@/lib/auth";
import { buildInventoryWorkbook, XLSX_CONTENT_TYPE } from "@/lib/excel";
import {
  hasActiveFilters,
  parseItemFilters,
  toExportQuery,
} from "@/lib/item-filter-params";
import { prisma } from "@/lib/prisma";
import { buildItemWhere, ITEM_INCLUDE, itemOrderBy } from "@/lib/queries";

/**
 * Ekspor barang ke satu berkas Excel: sheet `Ringkasan` berisi rekap per tahun,
 * lalu satu sheet per **tahun pada kode barang** (`INV-2026-…` → sheet `2026`).
 * Barang yang sudah dihapus (soft delete) tidak ikut, sama seperti ekspor CSV
 * sebelumnya.
 *
 * Sejak Tier B, rute ini menerima **filter yang sama dengan halaman `/items`**
 * (`q`, `status`, `condition`, `categoryId`, `departmentId`, `locationId`,
 * `branchId`, `acquisitionSource`). Tombol "Ekspor hasil filter" di toolbar
 * mengirim query string yang sedang aktif, sehingga berkas yang diunduh berisi
 * barang yang sama dengan yang terlihat di layar. Tanpa parameter, perilakunya
 * tetap seperti dulu: seluruh barang aktif.
 *
 * Catatan: `exceljs` menyusun .xlsx lewat zip/stream milik Node, jadi rute ini
 * hanya boleh jalan di runtime Node. Segment config `runtime` tidak dipakai
 * karena `cacheComponents` di `next.config.ts` melarangnya — runtime Node sudah
 * menjadi default untuk route handler.
 */
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const { filters } = parseItemFilters(searchParams);

  const items = await prisma.item.findMany({
    where: buildItemWhere(filters),
    include: ITEM_INCLUDE,
    orderBy: itemOrderBy(filters.sort),
  });

  const bytes = await buildInventoryWorkbook(items);
  const stamp = new Date().toISOString().slice(0, 10);
  // Nama berkas menyebut bahwa isinya terfilter, supaya tidak tertukar dengan
  // ekspor penuh saat keduanya tersimpan di folder yang sama.
  const suffix = hasActiveFilters(filters) ? "-terfilter" : "";

  return new Response(bytes, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="inventaris-${stamp}${suffix}.xlsx"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      // Berguna saat menelusuri hasil unduhan: filter apa yang dipakai.
      "X-Export-Filter": toExportQuery(filters) || "none",
    },
  });
}

import { isAuthenticated } from "@/lib/auth";
import { ACQUISITION_SOURCE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const COLUMNS = [
  "Kode",
  "Nama",
  "Kategori",
  "Merek",
  "Model",
  "Jumlah",
  "Satuan",
  "Harga",
  "Total Nilai",
  "Tanggal Beli",
  "Garansi Sampai",
  "Kondisi",
  "Status",
  "Lokasi",
  "Cabang Lokasi",
  "Sumber Perolehan",
  "Cabang Pembeli",
  "Pemilik Aset",
  "Dipegang Oleh",
  "Nomor Seri",
  "No. Invoice",
  "Supplier",
  "Tanggal Dibuang",
  "Alasan Dibuang",
  "Tanggal Jual",
  "Harga Jual",
  "Catatan",
] as const;

/** Bungkus nilai agar aman dipakai di CSV (koma, kutip, baris baru). */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\r\n;]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(",");
}

function toIsoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const items = await prisma.item.findMany({
    where: { deletedAt: null },
    include: {
      category: true,
      brand: true,
      supplier: true,
      sourceBranch: true,
      ownerBranch: true,
      location: { include: { branch: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const lines = [csvRow([...COLUMNS])];

  for (const item of items) {
    lines.push(
      csvRow([
        item.code,
        item.name,
        item.category?.name,
        item.brand?.name,
        item.model,
        item.quantity,
        item.unit,
        item.price,
        item.price * item.quantity,
        toIsoDate(item.purchaseDate),
        toIsoDate(item.warrantyUntil),
        item.condition,
        item.status,
        item.location?.name,
        item.location?.branch?.name,
        ACQUISITION_SOURCE_LABELS[item.acquisitionSource],
        item.sourceBranch?.name,
        item.ownerBranch?.name ?? "Kantor pusat",
        item.assignedTo,
        item.serialNumber,
        item.invoiceNo,
        item.supplier?.name,
        toIsoDate(item.disposedAt),
        item.disposalReason,
        toIsoDate(item.soldAt),
        item.soldPrice,
        item.notes,
      ]),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM dipakai supaya Excel membaca huruf beraksen dengan benar.
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventaris-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

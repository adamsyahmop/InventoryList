import ExcelJS from "exceljs";
import {
  ACQUISITION_SOURCE_LABELS,
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_LABELS,
  itemCodeYear,
} from "./constants";
import type { ItemWithRelations } from "./queries";

/** Tipe MIME resmi `.xlsx`; dipakai route handler sekaligus smoke test. */
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Sheet penampung kode barang yang tidak memuat tahun — mis. kode lama yang
 * diketik manual sebelum format `INV-<tahun>-<nomor>` dipakai. Barangnya tetap
 * ikut diekspor, hanya tidak bisa ditebak tahunnya dari kode.
 */
export const SHEET_WITHOUT_YEAR = "Tanpa Tahun";
/** Sheet pertama: rekap angka per tahun, supaya tidak perlu menjumlah manual. */
export const SUMMARY_SHEET = "Ringkasan";

const RUPIAH_FORMAT = '"Rp"#,##0';
const NUMBER_FORMAT = "#,##0";
/** Tanggal ditulis sebagai tanggal asli Excel (bukan teks) agar bisa diurutkan. */
const DATE_FORMAT = "dd/mm/yyyy";
/** indigo-100, senada dengan aksen UI. */
const HEADER_FILL = "FFE0E7FF";
const LINE_COLOR = "FF9CA3AF";

type CellValue = string | number | Date | null;

type Column = {
  header: string;
  width: number;
  /** Format angka/tanggal Excel; kosong berarti teks apa adanya. */
  numFmt?: string;
  value: (item: ItemWithRelations) => CellValue;
  /** true = ikut dijumlahkan pada baris TOTAL. */
  sum?: boolean;
};

/**
 * Kolom lembar per tahun. Susunannya sengaja sama persis dengan ekspor CSV
 * sebelumnya supaya penerima laporan tidak perlu belajar ulang.
 */
const COLUMNS: Column[] = [
  { header: "Kode", width: 20, value: (item) => item.code },
  { header: "Nama", width: 34, value: (item) => item.name },
  { header: "Kategori", width: 18, value: (item) => item.category?.name ?? null },
  {
    header: "Unit Pengelola",
    width: 22,
    // Nama + kode unit: kode dipakai di dokumen resmi, nama supaya enak dibaca.
    value: (item) =>
      item.department ? `${item.department.name} (${item.department.code})` : null,
  },
  { header: "Merek", width: 16, value: (item) => item.brand?.name ?? null },
  { header: "Model", width: 24, value: (item) => item.model },
  {
    header: "Jumlah",
    width: 9,
    numFmt: NUMBER_FORMAT,
    sum: true,
    value: (item) => item.quantity,
  },
  { header: "Satuan", width: 10, value: (item) => item.unit },
  { header: "Harga", width: 15, numFmt: RUPIAH_FORMAT, value: (item) => item.price },
  {
    header: "Total Nilai",
    width: 16,
    numFmt: RUPIAH_FORMAT,
    sum: true,
    value: (item) => item.price * item.quantity,
  },
  {
    header: "Tanggal Beli",
    width: 14,
    numFmt: DATE_FORMAT,
    value: (item) => item.purchaseDate,
  },
  {
    header: "Garansi Sampai",
    width: 15,
    numFmt: DATE_FORMAT,
    value: (item) => item.warrantyUntil,
  },
  { header: "Kondisi", width: 15, value: (item) => ITEM_CONDITION_LABELS[item.condition] },
  { header: "Status", width: 12, value: (item) => ITEM_STATUS_LABELS[item.status] },
  { header: "Lokasi", width: 22, value: (item) => item.location?.name ?? null },
  {
    header: "Cabang Lokasi",
    width: 18,
    value: (item) => item.location?.branch?.name ?? null,
  },
  {
    header: "Sumber Perolehan",
    width: 18,
    value: (item) => ACQUISITION_SOURCE_LABELS[item.acquisitionSource],
  },
  { header: "Cabang Pembeli", width: 18, value: (item) => item.sourceBranch?.name ?? null },
  {
    header: "Pemilik Aset",
    width: 18,
    // Cabang pemilik kosong = aset kantor pusat (lihat README).
    value: (item) => item.ownerBranch?.name ?? "Kantor pusat",
  },
  { header: "Dipegang Oleh", width: 18, value: (item) => item.assignedTo },
  { header: "Nomor Seri", width: 20, value: (item) => item.serialNumber },
  { header: "No. Invoice", width: 16, value: (item) => item.invoiceNo },
  { header: "Supplier", width: 20, value: (item) => item.supplier?.name ?? null },
  {
    header: "Tanggal Dibuang",
    width: 15,
    numFmt: DATE_FORMAT,
    value: (item) => item.disposedAt,
  },
  { header: "Alasan Dibuang", width: 24, value: (item) => item.disposalReason },
  { header: "Tanggal Jual", width: 14, numFmt: DATE_FORMAT, value: (item) => item.soldAt },
  { header: "Harga Jual", width: 15, numFmt: RUPIAH_FORMAT, value: (item) => item.soldPrice },
  { header: "Catatan", width: 30, value: (item) => item.notes },
];

export type ItemYearGroup = {
  /** Nama sheet sekaligus label tahunnya: `"2026"` atau `"Tanpa Tahun"`. */
  name: string;
  items: ItemWithRelations[];
};

/**
 * Kelompokkan barang per **tahun pada kode barang** (`INV-2026-…` → `2026`),
 * bukan per tanggal beli, supaya isi sheet selalu cocok dengan nomor inventaris
 * yang tercetak di label fisik barang.
 *
 * Urutan: tahun terbaru dulu (selaras dengan urutan "Terbaru" di daftar barang),
 * sedangkan `Tanpa Tahun` selalu di paling akhir. Di dalam satu sheet barang
 * diurutkan menurut kode supaya mengikuti nomor urut inventaris.
 */
export function groupItemsByCodeYear(items: ItemWithRelations[]): ItemYearGroup[] {
  const buckets = new Map<string, ItemWithRelations[]>();

  for (const item of items) {
    const year = itemCodeYear(item.code);
    const name = year === null ? SHEET_WITHOUT_YEAR : String(year);
    const bucket = buckets.get(name);
    if (bucket) bucket.push(item);
    else buckets.set(name, [item]);
  }

  return [...buckets.entries()]
    .map(([name, rows]) => ({
      name,
      items: [...rows].sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => {
      if (a.name === SHEET_WITHOUT_YEAR) return 1;
      if (b.name === SHEET_WITHOUT_YEAR) return -1;
      return Number(b.name) - Number(a.name);
    });
}

function totalQuantity(items: ItemWithRelations[]): number {
  return items.reduce((acc, item) => acc + item.quantity, 0);
}

/** Nilai perolehan (`price × quantity`), sama seperti kolom "Total Nilai". */
function totalValue(items: ItemWithRelations[]): number {
  return items.reduce((acc, item) => acc + item.price * item.quantity, 0);
}

function sumColumn(items: ItemWithRelations[], column: Column): number {
  return items.reduce((acc, item) => {
    const value = column.value(item);
    return acc + (typeof value === "number" ? value : 0);
  }, 0);
}

/** Baris judul: tebal, berlatar, dengan garis bawah sebagai pemisah. */
function styleHeaderRow(sheet: ExcelJS.Worksheet, columnCount: number): void {
  const row = sheet.getRow(1);
  row.font = { bold: true };
  row.height = 22;
  row.alignment = { vertical: "middle" };

  for (let index = 1; index <= columnCount; index += 1) {
    const cell = row.getCell(index);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: LINE_COLOR } } };
  }
}

function styleTotalRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.border = { top: { style: "thin", color: { argb: LINE_COLOR } } };
}

/** Satu sheet = satu tahun: baris barang, lalu baris TOTAL. */
function addYearSheet(workbook: ExcelJS.Workbook, group: ItemYearGroup): void {
  const sheet = workbook.addWorksheet(group.name, {
    // Judul kolom dibekukan supaya tetap terbaca saat menggulir ke bawah.
    views: [{ state: "frozen", ySplit: 1 }],
    // Laporan ini lebar (28 kolom) dan biasanya dicetak, jadi dipaksa lanskap.
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.columns = COLUMNS.map((column) => ({
    header: column.header,
    width: column.width,
    style: column.numFmt ? { numFmt: column.numFmt } : {},
  }));

  for (const item of group.items) {
    sheet.addRow(COLUMNS.map((column) => column.value(item)));
  }

  const total = sheet.addRow(
    COLUMNS.map((column, index) => {
      if (index === 0) return `TOTAL (${group.items.length} barang)`;
      return column.sum ? sumColumn(group.items, column) : null;
    }),
  );
  styleTotalRow(total);

  styleHeaderRow(sheet, COLUMNS.length);
  // Filter hanya mencakup baris data, sehingga baris TOTAL tidak ikut tersaring.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, group.items.length + 1), column: COLUMNS.length },
  };
}

/** Rekap jumlah barang, unit, dan nilai perolehan tiap tahun. */
function addSummarySheet(workbook: ExcelJS.Workbook, groups: ItemYearGroup[]): void {
  const sheet = workbook.addWorksheet(SUMMARY_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Tahun", width: 14 },
    { header: "Jumlah Barang", width: 16, style: { numFmt: NUMBER_FORMAT } },
    { header: "Total Unit", width: 14, style: { numFmt: NUMBER_FORMAT } },
    { header: "Total Nilai Perolehan", width: 24, style: { numFmt: RUPIAH_FORMAT } },
  ];

  for (const group of groups) {
    sheet.addRow([
      group.name,
      group.items.length,
      totalQuantity(group.items),
      totalValue(group.items),
    ]);
  }

  styleTotalRow(
    sheet.addRow([
      "TOTAL",
      groups.reduce((acc, group) => acc + group.items.length, 0),
      groups.reduce((acc, group) => acc + totalQuantity(group.items), 0),
      groups.reduce((acc, group) => acc + totalValue(group.items), 0),
    ]),
  );

  styleHeaderRow(sheet, 4);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, groups.length + 1), column: 4 },
  };

  // Satu baris keterangan supaya aturan pengelompokan tidak perlu ditanyakan.
  const note = sheet.addRow([
    `Dikelompokkan per tahun pada kode barang (INV-2026-… → 2026). Kode tanpa tahun masuk sheet "${SHEET_WITHOUT_YEAR}".`,
  ]);
  note.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
}

/**
 * Susun berkas .xlsx: sheet `Ringkasan` + satu sheet per tahun pada kode barang.
 * Barang terhapus (soft delete) sudah disaring pemanggil, jadi fungsi ini murni
 * soal penyajian dan gampang diuji.
 */
export async function buildInventoryWorkbook(
  items: ItemWithRelations[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventory List";
  workbook.created = new Date();

  const groups = groupItemsByCodeYear(items);
  addSummarySheet(workbook, groups);
  for (const group of groups) {
    addYearSheet(workbook, group);
  }

  // exceljs mengetikkan hasilnya sebagai ArrayBuffer, padahal saat berjalan di
  // Node isinya Buffer. Salinannya dimasukkan ke ArrayBuffer milik sendiri
  // supaya tipe yang keluar pasti `ArrayBuffer` — nilai yang sah dipakai
  // langsung sebagai body `Response`.
  const view = new Uint8Array(await workbook.xlsx.writeBuffer());
  const bytes = new ArrayBuffer(view.byteLength);
  new Uint8Array(bytes).set(view);
  return bytes;
}

/**
 * Import barang dari berkas `.xlsx` (Tier B).
 *
 * Format acuan adalah **berkas hasil ekspor aplikasi ini sendiri**
 * (`src/lib/excel.ts`) — kolomnya sama, jadi pengguna bisa mengunduh, mengisi,
 * lalu mengimpor balik. Kolom yang tidak ada di file tetap boleh: nilai yang
 * wajib menurut `itemSchema` diberi default yang masuk akal (lihat
 * `DEFAULTS`), sedangkan nilai yang tidak dikenal **ditolak per baris** dengan
 * pesan yang menyebut kolom dan isinya.
 *
 * Prinsip yang dipegang:
 * - data master (kategori, merek, unit, lokasi, supplier, cabang) dicocokkan
 *   **berdasarkan nama**, tidak pernah dibuat otomatis — salah ketik harus
 *   terlihat sebagai error, bukan jadi master baru yang sampah;
 * - satu baris gagal tidak membatalkan baris lain; hasilnya dilaporkan per
 *   baris lengkap dengan nama sheet dan nomor barisnya;
 * - modul ini murni baca-parse. Penulisan ke database ada di
 *   `src/lib/actions/import.ts`.
 */

import ExcelJS from "exceljs";
import {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";
import {
  ACQUISITION_SOURCE_LABELS,
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_LABELS,
  ITEM_TYPE_VALUES,
  type ItemTypeCode,
} from "./constants";
import { itemSchema, type ItemInput } from "./validations";

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 6 * 1024 * 1024;

export type ImportRowError = { sheet: string; row: number; message: string };

export type ParsedImportRow = {
  sheet: string;
  row: number;
  /** Kode dari berkas (huruf besar). Kosong = server membuat nomor berikutnya. */
  code: string;
  /** Jenis aset dari kolom `Jenis` atau dari akhiran kode. */
  assetType: ItemTypeCode | null;
  data: ItemInput;
};

export type ParsedWorkbook = {
  rows: ParsedImportRow[];
  errors: ImportRowError[];
  /** Sheet yang dilewati karena bukan daftar barang (mis. `Ringkasan`). */
  skippedSheets: string[];
  /** Baris yang lewat batas `IMPORT_MAX_ROWS` (tidak diimpor). */
  truncated: number;
};

export type MasterRecord = { id: string; name: string; code?: string | null };

export type MasterIndex = {
  category: Map<string, string>;
  brand: Map<string, string>;
  department: Map<string, string>;
  supplier: Map<string, string>;
  location: Map<string, string>;
  branch: Map<string, string>;
};

const key = (value: string) => value.trim().toLowerCase();

function indexRecords(records: MasterRecord[], withCode = false): Map<string, string> {
  const map = new Map<string, string>();
  for (const record of records) {
    map.set(key(record.name), record.id);
    if (withCode && record.code) {
      const byCode = key(record.code);
      if (!map.has(byCode)) map.set(byCode, record.id);
    }
  }
  return map;
}

/** Susun indeks nama → id untuk pencocokan kolom teks di berkas. */
export function buildMasterIndex(input: {
  categories: MasterRecord[];
  brands: MasterRecord[];
  departments: MasterRecord[];
  suppliers: MasterRecord[];
  locations: MasterRecord[];
  branches: MasterRecord[];
}): MasterIndex {
  return {
    category: indexRecords(input.categories),
    brand: indexRecords(input.brands),
    // Unit pengelola diekspor sebagai "Nama (KODE)", jadi kode ikut dicocokkan.
    department: indexRecords(input.departments, true),
    supplier: indexRecords(input.suppliers),
    location: indexRecords(input.locations),
    branch: indexRecords(input.branches),
  };
}

/** Default untuk kolom yang boleh kosong. */
const DEFAULTS = {
  quantity: 1,
  unit: "unit",
  price: 0,
  condition: ItemCondition.GOOD,
  status: ItemStatus.AVAILABLE,
  acquisitionSource: AcquisitionSource.HEAD_OFFICE,
};

type FieldName =
  | "code"
  | "assetType"
  | "name"
  | "category"
  | "department"
  | "brand"
  | "model"
  | "quantity"
  | "unit"
  | "price"
  | "purchaseDate"
  | "warrantyUntil"
  | "condition"
  | "status"
  | "location"
  | "acquisitionSource"
  | "sourceBranch"
  | "ownerBranch"
  | "assignedTo"
  | "serialNumber"
  | "invoiceNo"
  | "supplier"
  | "disposedAt"
  | "disposalReason"
  | "soldAt"
  | "soldPrice"
  | "notes";

/**
 * Judul kolom yang diterima. Kunci = judul yang sudah dinormalkan (huruf kecil,
 * spasi tunggal). Semua judul ekspor aplikasi sudah tercakup; beberapa alias
 * ditambahkan untuk berkas buatan tangan.
 */
const HEADERS: Record<string, FieldName> = {
  kode: "code",
  "kode barang": "code",
  nama: "name",
  "nama barang": "name",
  jenis: "assetType",
  "jenis aset": "assetType",
  kategori: "category",
  "unit pengelola": "department",
  departemen: "department",
  unit: "unit",
  merek: "brand",
  model: "model",
  jumlah: "quantity",
  satuan: "unit",
  harga: "price",
  "harga beli": "price",
  "harga perolehan": "price",
  "tanggal beli": "purchaseDate",
  "tanggal perolehan": "purchaseDate",
  "garansi sampai": "warrantyUntil",
  "garansi hingga": "warrantyUntil",
  kondisi: "condition",
  status: "status",
  lokasi: "location",
  "cabang lokasi": "location",
  "sumber perolehan": "acquisitionSource",
  "cabang pembeli": "sourceBranch",
  "pemilik aset": "ownerBranch",
  "dipegang oleh": "assignedTo",
  pengguna: "assignedTo",
  "nomor seri": "serialNumber",
  "no. invoice": "invoiceNo",
  "nomor invoice": "invoiceNo",
  invoice: "invoiceNo",
  supplier: "supplier",
  "tanggal dibuang": "disposedAt",
  "alasan dibuang": "disposalReason",
  "tanggal jual": "soldAt",
  "harga jual": "soldPrice",
  catatan: "notes",
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");

/** Ambil teks dari sel ExcelJS apa pun bentuknya (string, richText, formula). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("formula" in value && typeof value.formula === "string") return "";
  }
  return "";
}

/** Angka dari sel numerik atau teks ("Rp1.234.567" → 1234567). */
function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return value;
  const text = cellText(value);
  if (!text) return null;
  const digits = text.replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tanggal dari komponen tahun/bulan/hari, ditolak bila "meluap" — `31/13/2026`
 * bukan tanggal yang sah, dan `new Date()` akan diam-diam menggesernya ke bulan
 * berikutnya. Tanpa pemeriksaan balik, salah ketik di berkas lolos jadi tanggal
 * yang salah tanpa peringatan.
 */
function validDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Tanggal dari sel tanggal Excel, serial number, atau teks `dd/mm/yyyy` /
 * `yyyy-mm-dd`. Mengembalikan `undefined` untuk sel kosong dan `null` untuk
 * isi yang tidak bisa dibaca (pemanggil membedakan keduanya).
 */
function cellDate(value: ExcelJS.CellValue): Date | null | undefined {
  if (value === null || value === undefined || cellText(value) === "") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number") {
    // Serial tanggal Excel: hari ke-1 = 1900-01-01 (dengan bug 1900), asal 1899-12-30.
    const ms = Date.UTC(1899, 11, 30) + value * 86_400_000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = cellText(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) return validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Label Indonesia → nilai enum; nilai mentah (`GOOD`) juga diterima. */
function fromLabels<T extends string>(labels: Record<T, string>, value: string): T | null {
  const wanted = key(value);
  if (!wanted) return null;
  for (const [enumValue, label] of Object.entries(labels) as [string, string][]) {
    if (key(label) === wanted || key(enumValue) === wanted) return enumValue as T;
  }
  return null;
}

function parseAssetType(value: string): ItemTypeCode | null {
  const wanted = value.trim().toUpperCase();
  return (ITEM_TYPE_VALUES as readonly string[]).includes(wanted)
    ? (wanted as ItemTypeCode)
    : null;
}

/** Akhiran kode `INV-2026-0011-LPT` → `LPT`. */
function assetTypeFromCode(code: string): ItemTypeCode | null {
  const parts = code.trim().toUpperCase().split("-");
  if (parts.length < 4) return null;
  return parseAssetType(parts[parts.length - 1]);
}

/** "Nama (KODE)" → coba nama dulu, lalu kode di dalam tanda kurung. */
function resolveDepartment(
  value: string,
  index: MasterIndex,
): { id: string } | { error: string } {
  const text = value.trim();
  const direct = index.department.get(key(text));
  if (direct) return { id: direct };

  const wrapped = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text);
  if (wrapped) {
    const byName = index.department.get(key(wrapped[1]));
    if (byName) return { id: byName };
    const byCode = index.department.get(key(wrapped[2]));
    if (byCode) return { id: byCode };
  }
  return { error: `Unit pengelola "${text}" tidak ditemukan di data master.` };
}

function lookup(
  value: string,
  map: Map<string, string>,
  label: string,
): { id: string } | { error: string } {
  const id = map.get(key(value));
  return id ? { id } : { error: `${label} "${value.trim()}" tidak ditemukan di data master.` };
}

type CellMap = Partial<Record<FieldName, ExcelJS.CellValue>>;

/** Baris pertama yang memuat kolom `Nama` dianggap baris judul. */
function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; columns: Map<FieldName, number> } | null {
  const limit = Math.min(sheet.rowCount, 10);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const columns = new Map<FieldName, number>();
    sheet.getRow(rowNumber).eachCell((cell, colNumber) => {
      const field = HEADERS[normalizeHeader(cellText(cell.value))];
      if (field && !columns.has(field)) columns.set(field, colNumber);
    });
    if (columns.has("name")) return { rowNumber, columns };
  }
  return null;
}

/**
 * Baca seluruh sheet yang berbentuk daftar barang. Sheet lain (mis.
 * `Ringkasan` dari berkas ekspor) dilewati dan namanya dilaporkan.
 */
export async function parseItemWorkbook(
  buffer: Buffer,
  master: MasterIndex,
): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS mengetik `load()` dengan `Buffer` dari versi @types/node yang lain;
  // runtime menerima Buffer/Uint8Array apa pun.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const rows: ParsedImportRow[] = [];
  const errors: ImportRowError[] = [];
  const skippedSheets: string[] = [];
  let truncated = 0;

  for (const sheet of workbook.worksheets) {
    const header = findHeaderRow(sheet);
    if (!header) {
      skippedSheets.push(sheet.name);
      continue;
    }

    for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells: CellMap = {};
      for (const [field, colNumber] of header.columns) {
        cells[field] = row.getCell(colNumber).value;
      }

      const raw: Record<string, string> = {};
      for (const [field, value] of Object.entries(cells)) {
        raw[field] = cellText(value as ExcelJS.CellValue);
      }
      // Baris kosong (sisa format) dilewati tanpa dilaporkan.
      if (Object.values(raw).every((value) => value === "")) continue;

      if (rows.length >= IMPORT_MAX_ROWS) {
        truncated += 1;
        continue;
      }

      const parsed = buildRow(cells, sheet.name, rowNumber, master);
      if ("error" in parsed) {
        errors.push({ sheet: sheet.name, row: rowNumber, message: parsed.error });
        continue;
      }
      rows.push(parsed.row);
    }
  }

  return { rows, errors, skippedSheets, truncated };
}

function buildRow(
  cells: CellMap,
  sheet: string,
  row: number,
  master: MasterIndex,
): { row: ParsedImportRow } | { error: string } {
  const text = (field: FieldName) => cellText(cells[field] ?? null);

  const name = text("name");
  if (!name) return { error: "Nama barang kosong." };

  const problems: string[] = [];

  // --- kode & jenis aset ---------------------------------------------------
  const code = text("code").toUpperCase();
  const assetTypeRaw = text("assetType");
  let assetType: ItemTypeCode | null = null;
  if (assetTypeRaw) {
    assetType = parseAssetType(assetTypeRaw);
    if (!assetType) {
      problems.push(
        `Jenis aset "${assetTypeRaw}" tidak dikenal (pilihan: ${ITEM_TYPE_VALUES.join(", ")}).`,
      );
    }
  }
  if (!assetType) assetType = assetTypeFromCode(code);

  // --- data master --------------------------------------------------------
  const categoryId = text("category") ? lookup(text("category"), master.category, "Kategori") : null;
  const brandId = text("brand") ? lookup(text("brand"), master.brand, "Merek") : null;
  const departmentId = text("department")
    ? resolveDepartment(text("department"), master)
    : null;
  const supplierId = text("supplier") ? lookup(text("supplier"), master.supplier, "Supplier") : null;
  const locationId = text("location") ? lookup(text("location"), master.location, "Lokasi") : null;

  for (const result of [categoryId, brandId, departmentId, supplierId, locationId]) {
    if (result && "error" in result) problems.push(result.error);
  }

  // --- perolehan / kepemilikan -------------------------------------------
  const sourceRaw = text("acquisitionSource");
  let acquisitionSource: AcquisitionSource = DEFAULTS.acquisitionSource;
  if (sourceRaw) {
    const parsed = fromLabels(ACQUISITION_SOURCE_LABELS, sourceRaw);
    if (!parsed) {
      problems.push(
        `Sumber perolehan "${sourceRaw}" tidak dikenal (pilihan: ${Object.values(ACQUISITION_SOURCE_LABELS).join(", ")}).`,
      );
    } else {
      acquisitionSource = parsed;
    }
  }

  const sourceBranchRaw = text("sourceBranch");
  const sourceBranchId = sourceBranchRaw
    ? lookup(sourceBranchRaw, master.branch, "Cabang pembeli")
    : null;

  const ownerBranchRaw = text("ownerBranch");
  // "Kantor pusat" berarti tanpa cabang pemilik — sama seperti ekspor.
  const ownerBranchId =
    !ownerBranchRaw || key(ownerBranchRaw) === "kantor pusat"
      ? null
      : lookup(ownerBranchRaw, master.branch, "Pemilik aset");

  for (const result of [sourceBranchId, ownerBranchId]) {
    if (result && "error" in result) problems.push(result.error);
  }

  // --- kondisi & status ---------------------------------------------------
  const conditionRaw = text("condition");
  const condition = conditionRaw ? fromLabels(ITEM_CONDITION_LABELS, conditionRaw) : DEFAULTS.condition;
  if (!condition) {
    problems.push(
      `Kondisi "${conditionRaw}" tidak dikenal (pilihan: ${Object.values(ITEM_CONDITION_LABELS).join(", ")}).`,
    );
  }

  const statusRaw = text("status");
  const status = statusRaw ? fromLabels(ITEM_STATUS_LABELS, statusRaw) : DEFAULTS.status;
  if (!status) {
    problems.push(
      `Status "${statusRaw}" tidak dikenal (pilihan: ${Object.values(ITEM_STATUS_LABELS).join(", ")}).`,
    );
  }

  // --- angka & tanggal ----------------------------------------------------
  const quantityValue = cellNumber(cells.quantity ?? null);
  const quantity = quantityValue === null ? DEFAULTS.quantity : quantityValue;

  const priceValue = cellNumber(cells.price ?? null);
  const price = priceValue === null ? DEFAULTS.price : priceValue;

  const soldPriceValue = cellNumber(cells.soldPrice ?? null);
  const soldPrice = soldPriceValue === null ? undefined : soldPriceValue;

  const dateColumns = {
    purchaseDate: "Tanggal Beli",
    warrantyUntil: "Garansi Sampai",
    disposedAt: "Tanggal Dibuang",
    soldAt: "Tanggal Jual",
  } as const;

  const dates: Partial<Record<keyof typeof dateColumns, Date>> = {};
  for (const field of Object.keys(dateColumns) as (keyof typeof dateColumns)[]) {
    const value = cellDate(cells[field] ?? null);
    if (value === null) {
      problems.push(
        `Kolom "${dateColumns[field]}" tidak bisa dibaca sebagai tanggal (pakai dd/mm/yyyy atau format tanggal Excel).`,
      );
    } else if (value !== undefined) {
      dates[field] = value;
    }
  }

  if (problems.length) return { error: problems.join(" ") };

  const candidate = {
    code: code || undefined,
    assetType: assetType ?? undefined,
    name,
    brandId: brandId && "id" in brandId ? brandId.id : undefined,
    model: text("model") || undefined,
    categoryId: categoryId && "id" in categoryId ? categoryId.id : undefined,
    departmentId: departmentId && "id" in departmentId ? departmentId.id : undefined,
    quantity,
    unit: text("unit") || DEFAULTS.unit,
    purchaseDate: dates.purchaseDate,
    price,
    supplierId: supplierId && "id" in supplierId ? supplierId.id : undefined,
    invoiceNo: text("invoiceNo") || undefined,
    warrantyUntil: dates.warrantyUntil,
    condition,
    status,
    locationId: locationId && "id" in locationId ? locationId.id : undefined,
    assignedTo: text("assignedTo") || undefined,
    serialNumber: text("serialNumber") || undefined,
    notes: text("notes") || undefined,
    acquisitionSource,
    sourceBranchId: sourceBranchId && "id" in sourceBranchId ? sourceBranchId.id : undefined,
    ownerBranchId: ownerBranchId && "id" in ownerBranchId ? ownerBranchId.id : undefined,
    disposedAt: dates.disposedAt,
    disposalReason: text("disposalReason") || undefined,
    soldAt: dates.soldAt,
    soldPrice,
  };

  // Validasi akhir memakai skema yang sama dengan form barang, supaya aturan
  // (mis. jumlah ≥ 1, panjang teks, kode unik per pola) tidak bercabang.
  const parsed = itemSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(" ");
    return { error: first };
  }

  return {
    row: {
      sheet,
      row,
      code: code,
      assetType,
      data: parsed.data,
    },
  };
}

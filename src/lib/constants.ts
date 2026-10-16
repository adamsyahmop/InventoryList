import type {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  AVAILABLE: "Tersedia",
  IN_USE: "Dipakai",
  BORROWED: "Dipinjam",
  MAINTENANCE: "Perbaikan",
  LOST: "Hilang",
  DISPOSED: "Dibuang",
  SOLD: "Dijual",
};

export const ITEM_STATUS_BADGE: Record<ItemStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  IN_USE: "bg-blue-100 text-blue-800 ring-blue-600/20",
  BORROWED: "bg-amber-100 text-amber-800 ring-amber-600/20",
  MAINTENANCE: "bg-orange-100 text-orange-800 ring-orange-600/20",
  LOST: "bg-red-100 text-red-800 ring-red-600/20",
  DISPOSED: "bg-neutral-200 text-neutral-700 ring-neutral-500/20",
  SOLD: "bg-violet-100 text-violet-800 ring-violet-600/20",
};

/** Warna bar proporsi di dashboard, selaras dengan `ITEM_STATUS_BADGE`. */
export const ITEM_STATUS_BAR: Record<ItemStatus, string> = {
  AVAILABLE: "bg-emerald-500",
  IN_USE: "bg-blue-500",
  BORROWED: "bg-amber-500",
  MAINTENANCE: "bg-orange-500",
  LOST: "bg-red-500",
  DISPOSED: "bg-neutral-400",
  SOLD: "bg-violet-500",
};

export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: "Baru",
  GOOD: "Baik",
  FAIR: "Cukup",
  NEEDS_REPAIR: "Perlu Perbaikan",
  DAMAGED: "Rusak Berat",
};

export const ITEM_CONDITION_BADGE: Record<ItemCondition, string> = {
  NEW: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  GOOD: "bg-sky-100 text-sky-800 ring-sky-600/20",
  FAIR: "bg-amber-100 text-amber-800 ring-amber-600/20",
  NEEDS_REPAIR: "bg-orange-100 text-orange-800 ring-orange-600/20",
  DAMAGED: "bg-red-100 text-red-800 ring-red-600/20",
};

export const ACQUISITION_SOURCE_LABELS: Record<AcquisitionSource, string> = {
  HEAD_OFFICE: "Kantor Pusat",
  BRANCH: "Cabang",
};

export const ACQUISITION_SOURCE_BADGE: Record<AcquisitionSource, string> = {
  HEAD_OFFICE: "bg-indigo-100 text-indigo-800 ring-indigo-600/20",
  BRANCH: "bg-teal-100 text-teal-800 ring-teal-600/20",
};

/**
 * Status yang berarti barang sudah keluar dari daftar aset aktif. Dipakai
 * untuk memisahkan "nilai aset aktif" dari "nilai perolehan" di dashboard.
 * Catatannya: record-nya TIDAK dihapus, hanya dikeluarkan dari perhitungan.
 */
export const INACTIVE_STATUSES = ["DISPOSED", "SOLD"] as const satisfies readonly ItemStatus[];

export function isInactiveStatus(status: ItemStatus): boolean {
  return (INACTIVE_STATUSES as readonly ItemStatus[]).includes(status);
}

/** Alasan pelepasan yang sering dipakai; masih bisa diisi bebas. */
export const DISPOSAL_REASON_OPTIONS = [
  "Rusak berat",
  "Tidak ekonomis diperbaiki",
  "Usang / kedaluwarsa",
  "Hilang saat inventarisasi",
  "Digantikan unit baru",
  "Dijual",
  "Dihibahkan",
] as const;

/** Pilihan satuan yang sering dipakai. Masih bisa diisi bebas. */
export const UNIT_OPTIONS = [
  "pcs",
  "unit",
  "set",
  "box",
  "roll",
  "lusin",
  "meter",
  "kg",
  "liter",
] as const;

export const ITEMS_PER_PAGE = 10;

/**
 * Jenis aset. Menjadi **akhiran kode barang** supaya kode tetap pendek tetapi
 * langsung memberi tahu jenis barangnya: `INV-2026-0011-LPT`.
 * Diurutkan dari yang paling sering dipakai; `LAIN` selalu tersedia sebagai
 * pelarian agar baris lama/manual tetap bisa diberi jenis.
 */
export const ITEM_TYPE_VALUES = [
  "PC",
  "LPT",
  "PRN",
  "MON",
  "NET",
  "MOB",
  "FRN",
  "ELE",
  "LAIN",
] as const;

export type ItemTypeCode = (typeof ITEM_TYPE_VALUES)[number];

export const ITEM_TYPE_LABELS: Record<ItemTypeCode, string> = {
  PC: "Komputer / PC desktop",
  LPT: "Laptop / notebook",
  PRN: "Printer / scanner",
  MON: "Monitor / layar",
  NET: "Perangkat jaringan",
  MOB: "Perangkat mobile",
  FRN: "Furnitur",
  ELE: "Elektronik lain",
  LAIN: "Lain-lain",
};

/** Jenis aset dianggap terdaftar hanya bila ada di `ITEM_TYPE_VALUES`. */
export function isItemTypeCode(value: string | null | undefined): value is ItemTypeCode {
  return value !== null && value !== undefined && (ITEM_TYPE_VALUES as readonly string[]).includes(value);
}

/** Bangun kode barang: `INV-2026-0011` atau `INV-2026-0011-LPT`. */
export function buildItemCode(
  year: number,
  sequence: number,
  type?: string | null,
): string {
  const base = `INV-${year}-${String(sequence).padStart(4, "0")}`;
  return type ? `${base}-${type}` : base;
}

/**
 * Nomor urut dari kode `INV-<tahun>-<nomor>[-jenis]`. Mengembalikan 0 untuk kode
 * yang tidak mengikuti pola tersebut (mis. kode lama yang diketik manual),
 * sehingga tidak mengacaukan perhitungan nomor berikutnya.
 */
export function itemCodeSequence(code: string): number {
  const match = /^INV-\d{4}-(\d+)/i.exec(code.trim());
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Tahun dari kode `INV-<tahun>-<nomor>[-jenis]`, mis. `INV-2026-0001-LPT` → 2026.
 * Mengembalikan `null` untuk kode yang tidak mengikuti pola tersebut (mis. kode
 * lama yang diketik manual) supaya pemanggil bisa memutuskan sendiri cara
 * menampungnya — lihat `groupItemsByCodeYear()` di `src/lib/excel.ts`.
 */
export function itemCodeYear(code: string): number | null {
  const match = /^INV-(\d{4})\b/i.exec(code.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Label jenis aset; nilai tak dikenal dikembalikan apa adanya (jadi terlihat). */
export function itemTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return isItemTypeCode(type) ? ITEM_TYPE_LABELS[type] : type;
}

/** Batas unggahan foto barang (5 MiB). */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_URL_PREFIX = "/api/photos/";

/**
 * Ukuran berkas untuk pesan ke pengguna, mis. `3,4 MB` atau `720 KB`.
 *
 * Dipakai bersama oleh server (`src/lib/photos.ts`, pesan penolakan ukuran) dan
 * klien (`photo-field.tsx`, catatan sebelum unggah) supaya keduanya menyebut
 * angka dengan format yang sama persis.
 */
export function describePhotoSize(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1) return `${megabytes.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}


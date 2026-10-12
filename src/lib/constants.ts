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

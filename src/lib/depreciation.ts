/**
 * Penyusutan aset — **fungsi murni**, tanpa Prisma, supaya angka yang tampil di
 * laporan bisa diuji tanpa server.
 *
 * Metode yang dipakai: **garis lurus (straight-line)** per bulan, tanpa nilai
 * residu. Ini pilihan sadar, bukan karena paling canggih:
 *
 * - Inventaris kantor tidak punya nilai residu yang bisa dipertanggungjawabkan,
 *   jadi menebaknya justru menambah angka karangan.
 * - Metode saldo menurun ganda butuh tarif per kelompok aset dan menghasilkan
 *   angka yang lebih sulit dijelaskan ke bagian keuangan.
 * - Garis lurus cukup dengan dua parameter yang sudah ada (harga & tanggal
 *   perolehan) plus satu parameter opsional per kategori: umur ekonomis.
 *
 * Penyusutan dihitung **per bulan penuh** yang sudah lewat, dibulatkan ke rupiah
 * terdekat. Konsekuensinya: barang yang baru dibeli bulan ini masih bernilai
 * penuh, dan barang yang umurnya sudah melewati umur ekonomis bernilai 0 —
 * keduanya perilaku yang mudah dicek ulang secara manual.
 */
import type { ItemStatus } from "@/generated/prisma/enums";

/** Umur ekonomis bawaan bila kategori tidak mengisinya (4 tahun). */
export const DEFAULT_USEFUL_LIFE_MONTHS = 48;

/** Batas atas yang masuk akal; dipakai juga oleh validasi form. */
export const MAX_USEFUL_LIFE_MONTHS = 600;

export type DepreciationConfig = {
  /** `null`/`undefined` = pakai `DEFAULT_USEFUL_LIFE_MONTHS`. */
  usefulLifeMonths?: number | null;
};

export type DepreciationInput = DepreciationConfig & {
  /** Harga **satuan** (kolom `Item.price`). */
  price: number;
  quantity: number;
  purchaseDate: Date | string | null;
  status: ItemStatus;
  soldAt?: Date | string | null;
  soldPrice?: number | null;
  disposedAt?: Date | string | null;
};

export type Depreciation = {
  /** Umur ekonomis yang benar-benar dipakai (bulan). */
  usefulLifeMonths: number;
  /** Bulan penuh sejak perolehan, dibatasi umur ekonomis. */
  monthsElapsed: number;
  /** Umur sebenarnya (bulan, tanpa batas) — untuk ditampilkan apa adanya. */
  ageMonths: number;
  /** Penyusutan per unit per bulan. */
  monthlyPerUnit: number;
  /** Akumulasi penyusutan seluruh unit. */
  accumulated: number;
  /** Nilai buku seluruh unit (tidak pernah negatif). */
  bookValue: number;
  /** Nilai perolehan seluruh unit (`price * quantity`). */
  cost: number;
  /** Penyusutan sudah selesai (umur ≥ umur ekonomis). */
  fullyDepreciated: boolean;
  /** `false` bila tanggal perolehan kosong — nilai buku = harga perolehan. */
  hasPurchaseDate: boolean;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Jumlah bulan penuh dari `from` ke `to` (0 bila `to` lebih awal). */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  // Belum genap satu bulan bila tanggal `to` masih lebih kecil dari `from`.
  const notFullMonth = to.getUTCDate() < from.getUTCDate();
  return Math.max(0, notFullMonth ? months - 1 : months);
}

/** Umur ekonomis efektif: nilai kategori bila masuk akal, selain itu bawaan. */
export function resolveUsefulLifeMonths(config?: DepreciationConfig | null): number {
  const value = config?.usefulLifeMonths;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_USEFUL_LIFE_MONTHS;
  }
  return Math.min(Math.round(value), MAX_USEFUL_LIFE_MONTHS);
}

/**
 * Nilai buku satu unit pada tanggal tertentu.
 *
 * `at` sengaja bisa diisi: untuk barang yang sudah dijual/dibuang, laporan
 * memakai tanggal pelepasannya, bukan hari ini — supaya laba/rugi pelepasan
 * tidak berubah-ubah setiap kali laporan dibuka.
 */
export function bookValuePerUnit(
  input: Pick<DepreciationInput, "price" | "purchaseDate" | "usefulLifeMonths">,
  at: Date,
): { bookValue: number; accumulated: number; monthsElapsed: number; ageMonths: number; monthly: number; life: number } {
  const price = Math.max(0, Math.round(input.price ?? 0));
  const life = resolveUsefulLifeMonths(input);
  const purchase = toDate(input.purchaseDate);

  if (!purchase || price === 0) {
    return { bookValue: price, accumulated: 0, monthsElapsed: 0, ageMonths: 0, monthly: 0, life };
  }

  const ageMonths = monthsBetween(purchase, at);
  const monthsElapsed = Math.min(ageMonths, life);
  const accumulated = Math.round((price * monthsElapsed) / life);

  return {
    bookValue: Math.max(0, price - accumulated),
    accumulated,
    monthsElapsed,
    ageMonths,
    monthly: Math.round(price / life),
    life,
  };
}

/**
 * Ringkasan penyusutan satu barang (seluruh unit). Untuk barang yang sudah
 * dilepas, perhitungan berhenti di tanggal pelepasannya.
 */
export function depreciationFor(input: DepreciationInput, at: Date = new Date()): Depreciation {
  const quantity = Math.max(1, Math.round(input.quantity || 1));
  const releasedAt = toDate(input.soldAt) ?? toDate(input.disposedAt);
  const cutoff = releasedAt && releasedAt <= at ? releasedAt : at;

  const perUnit = bookValuePerUnit(input, cutoff);
  const booked = perUnit.bookValue * quantity;

  return {
    usefulLifeMonths: perUnit.life,
    monthsElapsed: perUnit.monthsElapsed,
    ageMonths: perUnit.ageMonths,
    monthlyPerUnit: perUnit.monthly,
    accumulated: perUnit.accumulated * quantity,
    // Harga perolehan bisa 0 (barang hibah/tidak dicatat); nilai buku tetap 0.
    bookValue: booked,
    cost: Math.max(0, Math.round(input.price ?? 0)) * quantity,
    fullyDepreciated: perUnit.life > 0 && perUnit.monthsElapsed >= perUnit.life,
    hasPurchaseDate: toDate(input.purchaseDate) !== null,
  };
}

/**
 * Hasil pelepasan aset: `laba` positif bila harga jual di atas nilai buku.
 * Barang yang dibuang (bukan dijual) selalu menghasilkan kerugian sebesar nilai
 * bukunya — itu nilai yang dihapus dari pembukuan.
 */
export function disposalOutcome(input: DepreciationInput, at: Date = new Date()): {
  bookValueAtRelease: number;
  saleProceeds: number | null;
  gainLoss: number;
  releasedAt: Date | null;
} {
  const release = toDate(input.soldAt) ?? toDate(input.disposedAt);
  const result = depreciationFor(input, at);

  if (input.status === "SOLD") {
    const proceeds = Math.max(0, Math.round(input.soldPrice ?? 0));
    return {
      bookValueAtRelease: result.bookValue,
      saleProceeds: proceeds,
      gainLoss: proceeds - result.bookValue,
      releasedAt: release,
    };
  }

  return {
    bookValueAtRelease: result.bookValue,
    saleProceeds: null,
    gainLoss: -result.bookValue,
    releasedAt: release,
  };
}

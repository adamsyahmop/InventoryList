import { describe, expect, it } from "vitest";
import {
  DEFAULT_USEFUL_LIFE_MONTHS,
  MAX_USEFUL_LIFE_MONTHS,
  bookValuePerUnit,
  depreciationFor,
  disposalOutcome,
  monthsBetween,
  resolveUsefulLifeMonths,
} from "@/lib/depreciation";

/** Tanggal UTC supaya hasilnya sama di mesin mana pun. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("monthsBetween", () => {
  it("menghitung bulan penuh, bukan selisih hari dibagi 30", () => {
    expect(monthsBetween(d("2026-01-15"), d("2026-02-15"))).toBe(1);
    expect(monthsBetween(d("2026-01-15"), d("2026-02-14"))).toBe(0);
    expect(monthsBetween(d("2025-06-15"), d("2026-10-21"))).toBe(16);
  });

  it("tidak pernah negatif untuk tanggal di masa depan", () => {
    expect(monthsBetween(d("2026-10-21"), d("2026-01-01"))).toBe(0);
    expect(monthsBetween(d("2026-10-21"), d("2026-10-21"))).toBe(0);
  });
});

describe("resolveUsefulLifeMonths", () => {
  it("memakai bawaan saat nilai kosong atau tidak masuk akal", () => {
    expect(resolveUsefulLifeMonths()).toBe(DEFAULT_USEFUL_LIFE_MONTHS);
    expect(resolveUsefulLifeMonths({ usefulLifeMonths: null })).toBe(DEFAULT_USEFUL_LIFE_MONTHS);
    expect(resolveUsefulLifeMonths({ usefulLifeMonths: 0 })).toBe(DEFAULT_USEFUL_LIFE_MONTHS);
    expect(resolveUsefulLifeMonths({ usefulLifeMonths: -12 })).toBe(DEFAULT_USEFUL_LIFE_MONTHS);
    expect(resolveUsefulLifeMonths({ usefulLifeMonths: Number.NaN })).toBe(
      DEFAULT_USEFUL_LIFE_MONTHS,
    );
  });

  it("menerima nilai wajar dan membatasi yang keterlaluan", () => {
    expect(resolveUsefulLifeMonths({ usefulLifeMonths: 12 })).toBe(12);
    expect(resolveUsefulLifeMonths({ usefulLifeMonths: 12.6 })).toBe(13);
    expect(resolveUsefulLifeMonths({ usefulLifeMonths: 99_999 })).toBe(MAX_USEFUL_LIFE_MONTHS);
  });
});

describe("bookValuePerUnit", () => {
  it("menyusut garis lurus per bulan penuh", () => {
    // 15 juta, umur 48 bulan, 16 bulan berjalan → 15.000.000 × 16/48.
    const result = bookValuePerUnit(
      { price: 15_000_000, purchaseDate: d("2025-06-15"), usefulLifeMonths: 48 },
      d("2026-10-21"),
    );
    expect(result.accumulated).toBe(5_000_000);
    expect(result.bookValue).toBe(10_000_000);
    expect(result.monthly).toBe(312_500);
    expect(result.monthsElapsed).toBe(16);
    expect(result.ageMonths).toBe(16);
  });

  it("nilai buku tidak pernah negatif setelah melewati umur ekonomis", () => {
    const result = bookValuePerUnit(
      { price: 4_800_000, purchaseDate: d("2020-01-10"), usefulLifeMonths: 24 },
      d("2026-10-21"),
    );
    expect(result.accumulated).toBe(4_800_000);
    expect(result.bookValue).toBe(0);
    expect(result.monthsElapsed).toBe(24);
    expect(result.ageMonths).toBeGreaterThan(24);
  });

  it("tanpa tanggal perolehan, nilai buku = harga perolehan", () => {
    const result = bookValuePerUnit(
      { price: 2_000_000, purchaseDate: null, usefulLifeMonths: 12 },
      d("2026-10-21"),
    );
    expect(result).toMatchObject({ accumulated: 0, bookValue: 2_000_000, monthsElapsed: 0 });
  });

  it("harga nol tidak menghasilkan penyusutan negatif", () => {
    const result = bookValuePerUnit(
      { price: 0, purchaseDate: d("2024-01-01"), usefulLifeMonths: 12 },
      d("2026-10-21"),
    );
    expect(result).toMatchObject({ accumulated: 0, bookValue: 0 });
  });

  it("tanggal perolehan di masa depan belum disusutkan", () => {
    const result = bookValuePerUnit(
      { price: 1_000_000, purchaseDate: d("2027-01-01"), usefulLifeMonths: 12 },
      d("2026-10-21"),
    );
    expect(result).toMatchObject({ accumulated: 0, bookValue: 1_000_000 });
  });
});

describe("depreciationFor", () => {
  const base = {
    price: 3_000_000,
    quantity: 3,
    purchaseDate: d("2026-01-01"),
    status: "AVAILABLE" as const,
    usefulLifeMonths: 12,
  };

  it("mengalikan angka per unit dengan jumlah", () => {
    // 10 bulan dari 12 → penyusutan 2.500.000/unit, nilai buku 500.000/unit.
    const result = depreciationFor(base, d("2026-11-01"));
    expect(result.cost).toBe(9_000_000);
    expect(result.accumulated).toBe(7_500_000);
    expect(result.bookValue).toBe(1_500_000);
  });

  it("menandai barang yang sudah habis umur ekonomis", () => {
    expect(depreciationFor(base, d("2026-11-01")).fullyDepreciated).toBe(false);
    expect(depreciationFor(base, d("2027-06-01")).fullyDepreciated).toBe(true);
  });

  it("menandai barang tanpa tanggal perolehan", () => {
    const result = depreciationFor({ ...base, purchaseDate: null }, d("2026-11-01"));
    expect(result.hasPurchaseDate).toBe(false);
    expect(result.bookValue).toBe(9_000_000);
  });

  it("berhenti menghitung pada tanggal jual, bukan hari ini", () => {
    const sold = {
      ...base,
      quantity: 1,
      status: "SOLD" as const,
      soldAt: d("2026-04-01"),
      soldPrice: 2_800_000,
    };
    // 3 bulan dari 12 → nilai buku 2.250.000, sama walau laporan dibuka 2027.
    expect(depreciationFor(sold, d("2026-11-01")).bookValue).toBe(2_250_000);
    expect(depreciationFor(sold, d("2027-11-01")).bookValue).toBe(2_250_000);
  });
});

describe("disposalOutcome", () => {
  const sold = {
    price: 9_000_000,
    quantity: 1,
    purchaseDate: d("2025-01-15"),
    status: "SOLD" as const,
    soldAt: d("2026-01-15"),
    soldPrice: 8_000_000,
    usefulLifeMonths: 36,
  };

  it("laba bila harga jual di atas nilai buku", () => {
    const result = disposalOutcome(sold, d("2026-10-21"));
    expect(result.bookValueAtRelease).toBe(6_000_000);
    expect(result.saleProceeds).toBe(8_000_000);
    expect(result.gainLoss).toBe(2_000_000);
    expect(result.releasedAt).toEqual(d("2026-01-15"));
  });

  it("rugi bila harga jual di bawah nilai buku", () => {
    const result = disposalOutcome({ ...sold, soldPrice: 5_000_000 }, d("2026-10-21"));
    expect(result.gainLoss).toBe(-1_000_000);
  });

  it("harga jual kosong dihitung sebagai nol, bukan diabaikan", () => {
    const result = disposalOutcome({ ...sold, soldPrice: null }, d("2026-10-21"));
    expect(result.saleProceeds).toBe(0);
    expect(result.gainLoss).toBe(-6_000_000);
  });

  it("barang dibuang: kerugian sebesar nilai bukunya", () => {
    const result = disposalOutcome(
      {
        price: 2_400_000,
        quantity: 1,
        purchaseDate: d("2025-07-01"),
        status: "DISPOSED",
        disposedAt: d("2026-01-01"),
        usefulLifeMonths: 24,
      },
      d("2026-10-21"),
    );
    // 6 bulan dari 24 → nilai buku 1.800.000.
    expect(result.bookValueAtRelease).toBe(1_800_000);
    expect(result.saleProceeds).toBeNull();
    expect(result.gainLoss).toBe(-1_800_000);
  });
});

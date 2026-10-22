import { describe, expect, it } from "vitest";
import {
  daysUntil,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
  toDateInputValue,
} from "@/lib/format";
import { buildSearchKey, firstParam } from "@/lib/utils";

describe("formatRupiah / formatNumber", () => {
  it("memformat rupiah tanpa desimal", () => {
    expect(formatRupiah(1_500_000)).toContain("1.500.000");
    expect(formatRupiah(0)).toContain("0");
    // Pembulatan ke rupiah terdekat: 999,5 → 1.000, bukan 999.
    expect(formatRupiah(999.5)).toContain("1.000");
  });

  it("nilai kosong ditampilkan sebagai tanda hubung, bukan 'NaN'", () => {
    expect(formatRupiah(null)).toBe("-");
    expect(formatRupiah(undefined)).toBe("-");
    expect(formatNumber(null)).toBe("-");
    expect(formatNumber(undefined)).toBe("-");
  });

  it("memformat ribuan", () => {
    expect(formatNumber(12_345)).toBe("12.345");
  });
});

describe("tanggal", () => {
  it("formatDate memakai bulan Indonesia dan zona Asia/Jakarta", () => {
    // 2026-10-07 17:00Z = 08 Oktober 00:00 WIB.
    const date = new Date("2026-10-07T17:00:00.000Z");
    expect(formatDate(date)).toContain("2026");
    expect(formatDate(date)).toContain("Okt");
    expect(formatDate(date)).toContain("08");
  });

  it("tanggal tidak sah tidak membuat halaman menampilkan 'Invalid Date'", () => {
    expect(formatDate("bukan tanggal")).toBe("-");
    expect(formatDateTime("bukan tanggal")).toBe("-");
    expect(formatDate(null)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("formatDateTime menyertakan jam", () => {
    const text = formatDateTime(new Date("2026-10-07T17:30:00.000Z"));
    expect(text).toContain("08");
    expect(text).toMatch(/00[.:]30/);
  });

  it("toDateInputValue menghasilkan YYYY-MM-DD untuk input date", () => {
    expect(toDateInputValue(new Date("2026-03-09T00:00:00.000Z"))).toBe("2026-03-09");
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("")).toBe("");
    expect(toDateInputValue("2026-13-40")).toBe("");
  });
});

describe("daysUntil", () => {
  const dayStart = (offsetDays: number) => {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
    );
  };

  it("menghitung sisa hari kalender, bukan jam", () => {
    expect(daysUntil(dayStart(0))).toBe(0);
    expect(daysUntil(dayStart(5))).toBe(5);
    expect(daysUntil(dayStart(-3))).toBe(-3);
  });

  it("nilai kosong menghasilkan null", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("bukan tanggal")).toBeNull();
  });
});

describe("buildSearchKey", () => {
  it("menggabungkan bagian yang terisi dan mengecilkan huruf", () => {
    expect(buildSearchKey("INV-2026-0001", "Asus  VivoBook", null, "Gudang A")).toBe(
      "inv-2026-0001 asus  vivobook gudang a",
    );
  });

  it("membuang bagian kosong/spasi saja", () => {
    expect(buildSearchKey("", "  ", null, undefined, "Elko")).toBe("elko");
    expect(buildSearchKey()).toBe("");
  });
});

describe("firstParam", () => {
  it("mengambil nilai pertama dari searchParams", () => {
    expect(firstParam("abc")).toBe("abc");
    expect(firstParam(["abc", "def"])).toBe("abc");
    expect(firstParam(undefined)).toBeUndefined();
    expect(firstParam([])).toBeUndefined();
  });
});

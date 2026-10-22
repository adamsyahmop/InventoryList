import { describe, expect, it } from "vitest";
import {
  buildItemCode,
  isInactiveStatus,
  isItemTypeCode,
  itemCodeSequence,
  itemCodeYear,
  itemTypeLabel,
} from "@/lib/constants";

describe("kode inventaris", () => {
  it("buildItemCode memberi nomor 4 digit dan akhiran jenis", () => {
    expect(buildItemCode(2026, 1)).toBe("INV-2026-0001");
    expect(buildItemCode(2026, 12, "LPT")).toBe("INV-2026-0012-LPT");
    expect(buildItemCode(2026, 9999, "")).toBe("INV-2026-9999");
  });

  it("itemCodeSequence membaca nomor, termasuk dari kode berjenis", () => {
    expect(itemCodeSequence("INV-2026-0001")).toBe(1);
    expect(itemCodeSequence("INV-2026-0042-LPT")).toBe(42);
    expect(itemCodeSequence("  inv-2026-0007  ")).toBe(7);
  });

  it("kode di luar pola dianggap 0, bukan NaN", () => {
    expect(itemCodeSequence("BARANG-LAMA")).toBe(0);
    expect(itemCodeSequence("")).toBe(0);
    expect(itemCodeSequence("INV-2026-")).toBe(0);
  });

  it("itemCodeYear mengembalikan tahun atau null", () => {
    expect(itemCodeYear("INV-2026-0001")).toBe(2026);
    expect(itemCodeYear("INV-2025-0099-PRN")).toBe(2025);
    expect(itemCodeYear("INV-26-1")).toBeNull();
    expect(itemCodeYear("tanpa pola")).toBeNull();
  });
});

describe("jenis aset", () => {
  it("mengenali kode jenis yang sah", () => {
    expect(isItemTypeCode("PC")).toBe(true);
    expect(isItemTypeCode("pc")).toBe(false);
    expect(isItemTypeCode("XYZ")).toBe(false);
    expect(isItemTypeCode(null)).toBe(false);
  });

  it("label jenis jatuh ke nilai aslinya bila tidak dikenal", () => {
    expect(itemTypeLabel("LPT")).not.toBeNull();
    expect(itemTypeLabel("XYZ")).toBe("XYZ");
    expect(itemTypeLabel("")).toBeNull();
    expect(itemTypeLabel(null)).toBeNull();
  });
});

describe("isInactiveStatus", () => {
  it("hanya DISPOSED dan SOLD yang dianggap tidak aktif", () => {
    expect(isInactiveStatus("DISPOSED")).toBe(true);
    expect(isInactiveStatus("SOLD")).toBe(true);
    for (const status of ["AVAILABLE", "IN_USE", "BORROWED", "MAINTENANCE", "LOST"] as const) {
      expect(isInactiveStatus(status)).toBe(false);
    }
  });
});

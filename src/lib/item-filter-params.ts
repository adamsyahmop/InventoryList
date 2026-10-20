/**
 * Satu tempat untuk membaca filter daftar barang dari query string.
 *
 * Dipakai oleh halaman `/items` **dan** `/api/export`, supaya berkas yang
 * diunduh memakai filter yang sama persis dengan yang terlihat di layar —
 * nilai yang tidak dikenal dibuang, bukan diteruskan mentah ke Prisma.
 */

import {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";
import type { ItemFilters, ItemSort } from "./queries";

const STATUS_VALUES = Object.values(ItemStatus) as string[];
const CONDITION_VALUES = Object.values(ItemCondition) as string[];
const SOURCE_VALUES = Object.values(AcquisitionSource) as string[];

export const ITEM_SORT_VALUES: ItemSort[] = [
  "newest",
  "oldest",
  "name",
  "price_desc",
  "price_asc",
];

/** `URLSearchParams` maupun pembungkus `Record<string, string>` sama-sama cocok. */
export type ParamsReader = { get(key: string): string | null };

const pick = (value: string, allowed: string[]) => (allowed.includes(value) ? value : "");

export function parseItemFilters(params: ParamsReader): {
  filters: ItemFilters;
  page: number;
} {
  const read = (key: string) => (params.get(key) ?? "").trim();

  const status = pick(read("status"), STATUS_VALUES);
  const condition = pick(read("condition"), CONDITION_VALUES);
  const acquisitionSource = pick(read("acquisitionSource"), SOURCE_VALUES);
  const sortRaw = read("sort");
  const sort = (ITEM_SORT_VALUES as string[]).includes(sortRaw)
    ? (sortRaw as ItemSort)
    : "newest";

  const pageRaw = Number(read("page") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  return {
    filters: {
      q: read("q"),
      status: status as ItemFilters["status"],
      condition: condition as ItemFilters["condition"],
      categoryId: read("categoryId"),
      departmentId: read("departmentId"),
      locationId: read("locationId"),
      branchId: read("branchId"),
      acquisitionSource: acquisitionSource as ItemFilters["acquisitionSource"],
      sort,
    },
    page,
  };
}

/** Filter yang benar-benar menyaring data (bukan sekadar urutan/halaman). */
export function hasActiveFilters(filters: ItemFilters): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.condition ||
      filters.categoryId ||
      filters.departmentId ||
      filters.locationId ||
      filters.branchId ||
      filters.acquisitionSource,
  );
}

/**
 * Query string untuk ekspor. `sort` sengaja tidak ikut: isi berkas selalu
 * diurutkan menurut kode barang per sheet (lihat `groupItemsByCodeYear`), jadi
 * mengirim urutan tampilan hanya akan menyesatkan.
 */
export type ExportFilterValues = {
  q?: string;
  status?: string;
  condition?: string;
  categoryId?: string;
  departmentId?: string;
  locationId?: string;
  branchId?: string;
  acquisitionSource?: string;
};

export function toExportQuery(filters: ExportFilterValues): string {
  const params = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    ["q", filters.q],
    ["status", filters.status],
    ["condition", filters.condition],
    ["categoryId", filters.categoryId],
    ["departmentId", filters.departmentId],
    ["locationId", filters.locationId],
    ["branchId", filters.branchId],
    ["acquisitionSource", filters.acquisitionSource],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form-controls";
import {
  ACQUISITION_SOURCE_LABELS,
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_LABELS,
} from "@/lib/constants";
import {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";
import { toExportQuery } from "@/lib/item-filter-params";

export type ItemFilterValues = {
  q: string;
  status: string;
  condition: string;
  categoryId: string;
  departmentId: string;
  locationId: string;
  branchId: string;
  acquisitionSource: string;
  sort: string;
};

type Option = { id: string; name: string };

const SORT_LABELS: Record<string, string> = {
  newest: "Terbaru",
  oldest: "Terlama",
  name: "Nama A-Z",
  price_desc: "Harga tertinggi",
  price_asc: "Harga terendah",
};

function buildHref(values: ItemFilterValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/items?${query}` : "/items";
}

export function ItemsToolbar({
  initial,
  categories,
  departments,
  locations,
  branches,
  total,
}: {
  initial: ItemFilterValues;
  categories: Option[];
  departments: Option[];
  locations: Option[];
  branches: Option[];
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ItemFilterValues>(initial);
  const isFirstRender = useRef(true);

  const navigate = (next: ItemFilterValues) => {
    startTransition(() => router.replace(buildHref(next)));
  };

  const update = (patch: Partial<ItemFilterValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    navigate(next);
  };

  // Debounce kolom pencarian supaya tidak navigasi tiap ketikan.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      startTransition(() => router.replace(buildHref(values)));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.q]);

  const hasFilter = Boolean(
    values.q ||
      values.status ||
      values.condition ||
      values.categoryId ||
      values.departmentId ||
      values.locationId ||
      values.branchId ||
      values.acquisitionSource,
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="filter-q">Cari</Label>
          <Input
            id="filter-q"
            value={values.q}
            onChange={(event) => setValues({ ...values, q: event.target.value })}
            placeholder="Nama, kode, merek, lokasi, serial…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <Select
            id="filter-status"
            value={values.status}
            onChange={(event) => update({ status: event.target.value })}
            className="w-36"
          >
            <option value="">Semua</option>
            {Object.values(ItemStatus).map((status) => (
              <option key={status} value={status}>
                {ITEM_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-condition">Kondisi</Label>
          <Select
            id="filter-condition"
            value={values.condition}
            onChange={(event) => update({ condition: event.target.value })}
            className="w-40"
          >
            <option value="">Semua</option>
            {Object.values(ItemCondition).map((condition) => (
              <option key={condition} value={condition}>
                {ITEM_CONDITION_LABELS[condition]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-category">Kategori</Label>
          <Select
            id="filter-category"
            value={values.categoryId}
            onChange={(event) => update({ categoryId: event.target.value })}
            className="w-40"
          >
            <option value="">Semua</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-department">Unit pengelola</Label>
          <Select
            id="filter-department"
            value={values.departmentId}
            onChange={(event) => update({ departmentId: event.target.value })}
            className="w-40"
          >
            <option value="">Semua</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-location">Lokasi</Label>
          <Select
            id="filter-location"
            value={values.locationId}
            onChange={(event) => update({ locationId: event.target.value })}
            className="w-40"
          >
            <option value="">Semua</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-branch">Cabang lokasi</Label>
          <Select
            id="filter-branch"
            value={values.branchId}
            onChange={(event) => update({ branchId: event.target.value })}
            className="w-44"
          >
            <option value="">Semua</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-source">Sumber</Label>
          <Select
            id="filter-source"
            value={values.acquisitionSource}
            onChange={(event) =>
              update({ acquisitionSource: event.target.value })
            }
            className="w-40"
          >
            <option value="">Semua</option>
            {Object.values(AcquisitionSource).map((source) => (
              <option key={source} value={source}>
                {ACQUISITION_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-sort">Urutkan</Label>
          <Select
            id="filter-sort"
            value={values.sort}
            onChange={(event) => update({ sort: event.target.value })}
            className="w-44"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {hasFilter ? (
          <Button
            variant="ghost"
            onClick={() =>
              update({
                q: "",
                status: "",
                condition: "",
                categoryId: "",
                departmentId: "",
                locationId: "",
                branchId: "",
                acquisitionSource: "",
              })
            }
          >
            Reset
          </Button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          {pending ? "Memuat…" : `${total} barang ditemukan`}
        </p>
        {/* Berkas yang diunduh memakai filter yang sedang aktif, bukan seluruh
            data — dulu tombol ekspor hanya ada di navbar dan selalu mengekspor
            semuanya. */}
        <div className="flex items-center gap-2">
          <ButtonLink
            href={`/items/labels${toExportQuery(values)}`}
            variant="outline"
            size="sm"
            title={
              hasFilter
                ? "Cetak label QR untuk barang yang sedang ditampilkan"
                : "Cetak label QR seluruh barang"
            }
          >
            Cetak label
          </ButtonLink>
          <ButtonLink
            href={`/api/export${toExportQuery(values)}`}
            variant="outline"
            size="sm"
            title={
              hasFilter
                ? "Unduh .xlsx berisi barang yang sedang ditampilkan"
                : "Unduh seluruh barang"
            }
          >
            {hasFilter ? "Ekspor hasil filter" : "Ekspor .xlsx"}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}


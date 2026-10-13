import { Suspense } from "react";
import type { Metadata } from "next";
import { ItemsTable } from "@/components/items/items-table";
import {
  ItemsToolbar,
  type ItemFilterValues,
} from "@/components/items/items-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";
import { getMasterData, listItems, type ItemSort } from "@/lib/queries";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Barang" };

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_VALUES = Object.values(ItemStatus) as string[];
const CONDITION_VALUES = Object.values(ItemCondition) as string[];
const SOURCE_VALUES = Object.values(AcquisitionSource) as string[];
const SORT_VALUES = ["newest", "oldest", "name", "price_desc", "price_asc"];

function parseSearchParams(params: SearchParams) {
  const statusRaw = firstParam(params.status) ?? "";
  const conditionRaw = firstParam(params.condition) ?? "";
  const sourceRaw = firstParam(params.acquisitionSource) ?? "";
  const sortRaw = firstParam(params.sort) ?? "newest";
  const pageRaw = Number(firstParam(params.page) ?? "1");

  const filters: ItemFilterValues = {
    q: firstParam(params.q) ?? "",
    status: STATUS_VALUES.includes(statusRaw) ? statusRaw : "",
    condition: CONDITION_VALUES.includes(conditionRaw) ? conditionRaw : "",
    categoryId: firstParam(params.categoryId) ?? "",
    departmentId: firstParam(params.departmentId) ?? "",
    locationId: firstParam(params.locationId) ?? "",
    branchId: firstParam(params.branchId) ?? "",
    acquisitionSource: SOURCE_VALUES.includes(sourceRaw) ? sourceRaw : "",
    sort: SORT_VALUES.includes(sortRaw) ? sortRaw : "newest",
  };

  const page =
    Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  return { filters, page };
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="h-24 animate-pulse bg-neutral-100" />
      <Card className="h-80 animate-pulse bg-neutral-100" />
    </div>
  );
}

function buildPageHref(filters: ItemFilterValues, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/items?${query}` : "/items";
}

async function ItemsSection({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { filters, page } = parseSearchParams(await searchParams);

  const [result, master] = await Promise.all([
    listItems({
      q: filters.q || undefined,
      status: (filters.status || undefined) as ItemStatus | undefined,
      condition: (filters.condition || undefined) as ItemCondition | undefined,
      categoryId: filters.categoryId || undefined,
      departmentId: filters.departmentId || undefined,
      locationId: filters.locationId || undefined,
      branchId: filters.branchId || undefined,
      acquisitionSource: (filters.acquisitionSource || undefined) as
        | AcquisitionSource
        | undefined,
      sort: filters.sort as ItemSort,
      page,
    }),
    getMasterData(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <ItemsToolbar
        initial={filters}
        categories={master.categories}
        departments={master.departments}
        locations={master.locations}
        branches={master.branches}
        total={result.total}
      />

      <ItemsTable items={result.items} />

      {result.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            Halaman {result.page} dari {result.pageCount}
          </p>
          <div className="flex gap-2">
            <ButtonLink
              href={buildPageHref(filters, Math.max(1, result.page - 1))}
              variant="outline"
              size="sm"
              aria-disabled={result.page <= 1}
              className={result.page <= 1 ? "pointer-events-none opacity-50" : ""}
            >
              ← Sebelumnya
            </ButtonLink>
            <ButtonLink
              href={buildPageHref(
                filters,
                Math.min(result.pageCount, result.page + 1),
              )}
              variant="outline"
              size="sm"
              aria-disabled={result.page >= result.pageCount}
              className={
                result.page >= result.pageCount
                  ? "pointer-events-none opacity-50"
                  : ""
              }
            >
              Berikutnya →
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daftar Barang"
        description="Semua barang inventaris beserta lokasi dan statusnya."
        action={<ButtonLink href="/items/new">+ Tambah Barang</ButtonLink>}
      />
      <Suspense fallback={<TableSkeleton />}>
        <ItemsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  MovementsToolbar,
  type MovementFilterValues,
} from "@/components/movements/movements-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { ItemStatus } from "@/generated/prisma/enums";
import { ITEM_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatNumber } from "@/lib/format";
import { listMovements } from "@/lib/queries";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Pergerakan" };

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_VALUES = Object.values(ItemStatus) as string[];

/**
 * Filter dibaca dan divalidasi di sini; nilai asing (status tidak dikenal,
 * tanggal ngawur, halaman bukan angka) jatuh ke default alih-alih diteruskan
 * mentah ke Prisma.
 */
function parseFilterParams(params: SearchParams) {
  const statusRaw = firstParam(params.status) ?? "";
  const pageRaw = Number(firstParam(params.page) ?? "1");

  const values: MovementFilterValues = {
    q: firstParam(params.q) ?? "",
    reason: firstParam(params.reason) ?? "",
    status: STATUS_VALUES.includes(statusRaw) ? statusRaw : "",
    from: firstParam(params.from) ?? "",
    to: firstParam(params.to) ?? "",
  };

  const page =
    Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  return { values, page };
}

function buildPageHref(values: MovementFilterValues, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/movements?${query}` : "/movements";
}

function MovementsSkeleton() {
  return <Card className="h-96 animate-pulse bg-neutral-100" />;
}

async function MovementsList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { values, page } = parseFilterParams(await searchParams);

  const result = await listMovements({
    q: values.q || undefined,
    reason: values.reason || undefined,
    status: (values.status || undefined) as ItemStatus | undefined,
    from: values.from || undefined,
    to: values.to || undefined,
    page,
  });

  const hasFilter = Boolean(
    values.q || values.reason || values.status || values.from || values.to,
  );

  return (
    <div className="flex flex-col gap-4">
      <MovementsToolbar initial={values} total={result.total} />

      <Card>
        <CardHeader
          title="Riwayat pergerakan terbaru"
          description={
            hasFilter
              ? `${result.total} catatan cocok dengan filter.`
              : `${result.total} catatan terakhir dari seluruh barang.`
          }
        />
        <CardBody className="p-0">
          {result.movements.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              {hasFilter
                ? "Tidak ada pergerakan yang cocok dengan filter ini."
                : "Belum ada pergerakan tercatat. Riwayat muncul setelah barang dipindahkan atau statusnya diubah."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Waktu</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Barang</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Dari</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Ke</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Jumlah</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Oleh</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {result.movements.map((movement) => (
                    <tr key={movement.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600">
                        {formatDateTime(movement.movedAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/items/${movement.item.id}`}
                          className="font-medium text-neutral-900 hover:text-indigo-600 hover:underline"
                        >
                          {movement.item.name}
                        </Link>
                        <p className="font-mono text-xs text-neutral-400">
                          {movement.item.code}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {movement.fromLocation?.name ?? "—"}
                        <span className="block text-xs text-neutral-400">
                          {movement.fromStatus
                            ? ITEM_STATUS_LABELS[movement.fromStatus]
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {movement.toLocation?.name ?? "—"}
                        <span className="block text-xs text-neutral-400">
                          {movement.toStatus
                            ? ITEM_STATUS_LABELS[movement.toStatus]
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-neutral-600">
                        {formatNumber(movement.quantity)}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {movement.movedBy ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500">
                        {[movement.reason, movement.notes]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {result.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-600">
            {`Halaman ${result.page} dari ${result.pageCount}`}
          </p>
          <div className="flex items-center gap-2">
            <ButtonLink
              href={buildPageHref(values, Math.max(1, result.page - 1))}
              variant="outline"
              size="sm"
              aria-disabled={result.page <= 1}
              className={
                result.page <= 1 ? "pointer-events-none opacity-50" : ""
              }
            >
              ← Sebelumnya
            </ButtonLink>
            <ButtonLink
              href={buildPageHref(
                values,
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

export default function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pergerakan Barang"
        description="Jejak audit perpindahan lokasi dan perubahan status barang."
      />
      <Suspense fallback={<MovementsSkeleton />}>
        <MovementsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

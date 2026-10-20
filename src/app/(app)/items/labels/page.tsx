import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintButton } from "@/components/print-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { parseItemFilters } from "@/lib/item-filter-params";
import { prisma } from "@/lib/prisma";
import { itemDetailUrl, qrSvg, requestOrigin } from "@/lib/qr";
import { buildItemWhere, ITEM_INCLUDE, itemOrderBy } from "@/lib/queries";

export const metadata: Metadata = { title: "Label massal" };

/**
 * Batas atas label per halaman cetak.
 *
 * Tujuannya bukan membatasi fitur, tapi menjaga satu permintaan tidak
 * menghasilkan ratusan QR sekaligus (satu QR ≈ 1,5 KB SVG; 1.000 barang berarti
 * halaman ~1,5 MB dan proses render yang lambat). Bisa dinaikkan lewat env
 * `LABELS_MAX` saat jumlah barang benar-benar banyak.
 */
const MAX_LABELS = Number(process.env.LABELS_MAX ?? 200);

type SearchParams = Record<string, string | string[] | undefined>;

/** `parseItemFilters` membaca query string, sedangkan halaman menerima record. */
function toSearchParams(params: SearchParams): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
  }
  return search;
}

function LabelsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100"
        />
      ))}
    </div>
  );
}

/**
 * Label massal untuk barang hasil filter. Filter dibaca dengan
 * `parseItemFilters` — parser yang sama dengan `/items` dan `/api/export` —
 * sehingga label yang tercetak selalu sama dengan yang terlihat di layar.
 *
 * Isinya sengaja lebih ringkas daripada label satuan (`/items/[id]/label`):
 * hanya kode, nama, dan lokasi. Status dan kondisi tidak dicetak karena
 * keduanya paling cepat basi, sedangkan kode dan nama justru yang dipakai
 * orang untuk mencocokkan fisik dengan data.
 */
async function LabelsSheet({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { filters } = parseItemFilters(
    toSearchParams(await searchParams),
  );

  const items = await prisma.item.findMany({
    where: buildItemWhere(filters),
    include: ITEM_INCLUDE,
    orderBy: itemOrderBy(filters.sort),
  });

  if (items.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-neutral-500">
            Tidak ada barang yang cocok dengan filter ini, jadi tidak ada label
            untuk dicetak.
          </p>
        </CardBody>
      </Card>
    );
  }

  const shown = items.slice(0, MAX_LABELS);
  const origin = await requestOrigin();
  const labels = await Promise.all(
    shown.map(async (item) => ({
      item,
      qr: await qrSvg(itemDetailUrl(origin, item.id), 128),
    })),
  );

  const truncatedFrom = items.length > shown.length ? items.length : 0;

  return (
    <>
      {/* Hanya area label yang ikut tercetak; header & tombol disembunyikan. */}
      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div className="print-area flex flex-col gap-3">
        <p className="text-sm text-neutral-600">
          {`${labels.length} label siap dicetak`}
          {truncatedFrom
            ? ` (dibatasi dari ${truncatedFrom} barang — persempit filter untuk sisanya)`
            : ""}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labels.map(({ item, qr }) => (
            <div
              key={item.id}
              className="flex break-inside-avoid flex-col items-center gap-1.5 rounded-lg border border-neutral-300 bg-white p-3 text-center"
            >
              <div
                className="[&>svg]:h-28 [&>svg]:w-28"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <span className="font-mono text-sm font-semibold text-neutral-900">
                {item.code}
              </span>
              <span className="line-clamp-2 text-xs font-medium text-neutral-800">
                {item.name}
              </span>
              <span className="text-[0.7rem] text-neutral-500">
                {item.location?.name ?? "Tanpa lokasi"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function ItemLabelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cetak label massal"
        description="Label QR untuk barang yang sedang difilter di daftar barang. Satu label per barang, QR menuju halaman detailnya."
        action={
          <div className="flex items-center gap-2">
            <PrintButton label="Cetak semua label" />
            <ButtonLink href="/items" variant="outline">
              Kembali ke daftar
            </ButtonLink>
          </div>
        }
      />
      <Suspense fallback={<LabelsSkeleton />}>
        <LabelsSheet searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

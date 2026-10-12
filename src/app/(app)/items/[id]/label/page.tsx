import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import {
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_LABELS,
  itemTypeLabel,
} from "@/lib/constants";
import { itemDetailUrl, qrSvg, requestOrigin } from "@/lib/qr";
import { getItem } from "@/lib/queries";

export const metadata: Metadata = { title: "Label QR Barang" };

/**
 * Isi label dirender saat request karena URL QR dibaca dari header
 * (`requestOrigin()`), jadi tidak bisa jadi bagian shell statis.
 */
async function ItemLabel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const url = itemDetailUrl(await requestOrigin(), item.id);
  const qr = await qrSvg(url, 192);

  return (
    <div className="flex flex-col gap-6">
      {/*
        Saat dicetak, hanya area label yang tampil: nav & footer dari layout
        disembunyikan supaya kertasnya tidak terbuang.
      */}
      <style>{`
        @page { margin: 12mm; }
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <PageHeader
        title="Label QR Barang"
        description="Cetak lalu tempelkan ke fisik barang. QR mengarah ke halaman detail barang ini, jadi staf bisa langsung membuka data terbarunya."
        action={
          <div className="flex items-center gap-2">
            <PrintButton />
            <ButtonLink href={`/items/${item.id}`} variant="outline">
              Kembali ke detail
            </ButtonLink>
          </div>
        }
      />

      <div className="print-area">
        <Card className="mx-auto w-full max-w-md">
          <CardBody className="flex flex-col items-center gap-4 text-center">
            <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">
              Inventaris Barang
            </p>

            <div
              className="rounded-lg bg-white p-2 ring-1 ring-neutral-200 [&>svg]:h-44 [&>svg]:w-44"
              dangerouslySetInnerHTML={{ __html: qr }}
            />

            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-lg font-semibold text-neutral-900">
                {item.code}
              </span>
              <span className="text-sm font-medium text-neutral-800">
                {item.name}
              </span>
              {item.model ? (
                <span className="text-xs text-neutral-500">{item.model}</span>
              ) : null}
            </div>

            <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-left text-xs">
              <div>
                <dt className="text-neutral-500">Jenis</dt>
                <dd className="text-neutral-800">
                  {itemTypeLabel(item.assetType) ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Kondisi</dt>
                <dd className="text-neutral-800">
                  {ITEM_CONDITION_LABELS[item.condition]}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Lokasi</dt>
                <dd className="text-neutral-800">
                  {item.location?.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Status</dt>
                <dd className="text-neutral-800">
                  {ITEM_STATUS_LABELS[item.status]}
                </dd>
              </div>
            </dl>

            <p className="text-[0.65rem] break-all text-neutral-400">{url}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function ItemLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Card className="mx-auto h-96 w-full max-w-md animate-pulse bg-neutral-100" />
      }
    >
      <ItemLabel params={params} />
    </Suspense>
  );
}

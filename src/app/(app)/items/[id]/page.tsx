import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DeleteItemButton } from "@/components/items/delete-item-button";
import { MovementForm } from "@/components/items/movement-form";
import { ButtonLink } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui/card";
import {
  ACQUISITION_SOURCE_BADGE,
  ACQUISITION_SOURCE_LABELS,
  ITEM_CONDITION_BADGE,
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_BADGE,
  ITEM_STATUS_LABELS,
  itemTypeLabel,
} from "@/lib/constants";
import { ItemStatus } from "@/generated/prisma/enums";
import {
  daysUntil,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
} from "@/lib/format";
import { itemDetailUrl, qrSvg, requestOrigin } from "@/lib/qr";
import { getItem, getItemMovements, getMasterData } from "@/lib/queries";

export const metadata: Metadata = { title: "Detail Barang" };

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
        {label}
      </dt>
      <dd className="text-sm text-neutral-800">{children ?? "—"}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="h-20 animate-pulse bg-neutral-100" />
      <Card className="h-80 animate-pulse bg-neutral-100" />
    </div>
  );
}

async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  // `connection()` menandai boundary ini dirender saat request, bukan saat
  // prerender. Diperlukan karena badge "Garansi N hari lagi" memakai
  // `daysUntil()` yang membaca waktu sekarang (`new Date()`); Cache Components
  // menolak nilai waktu yang tidak stabil di dalam shell statis.
  // Data sendiri tetap dilayani dari cache `"use cache"` di `queries.ts`.
  await connection();

  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const [movements, master] = await Promise.all([
    getItemMovements(id),
    getMasterData(),
  ]);

  const warrantyLeft = daysUntil(item.warrantyUntil);
  const isDeleted = item.deletedAt !== null;
  const isSold = item.status === ItemStatus.SOLD;
  const isDisposed = item.status === ItemStatus.DISPOSED;
  const releasedAt = isSold ? item.soldAt : isDisposed ? item.disposedAt : null;

  // QR berisi tautan ke halaman ini (berdasarkan ID, bukan kode barang) supaya
  // label yang sudah ditempel tetap valid walau kode/nama barang berubah.
  const detailUrl = itemDetailUrl(await requestOrigin(), item.id);
  const qr = await qrSvg(detailUrl);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.name}
        description={`Kode ${item.code}${item.model ? ` · ${item.model}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            {isDeleted ? null : (
              <ButtonLink href={`/items/${item.id}/edit`} variant="outline">
                Edit
              </ButtonLink>
            )}
            <DeleteItemButton id={item.id} deleted={isDeleted} />
          </div>
        }
      />

      {isDeleted ? (
        <Alert tone="info">
          Barang ini sudah dihapus dari daftar aktif
          {item.deletedAt ? ` pada ${formatDateTime(item.deletedAt)}` : ""}. Gunakan
          tombol Pulihkan untuk mengembalikannya.
        </Alert>
      ) : null}

      {isSold || isDisposed ? (
        <Alert tone="info">
          Barang ini sudah {isSold ? "dijual" : "dibuang"}
          {releasedAt ? ` pada ${formatDate(releasedAt)}` : ""}
          {isDisposed && item.disposalReason ? ` · ${item.disposalReason}` : ""}
          {isSold && item.soldPrice !== null
            ? ` · harga jual ${formatRupiah(item.soldPrice)}`
            : ""}
          . Harga perolehan {formatRupiah(item.price * item.quantity)} tetap
          tersimpan untuk audit, tetapi tidak dihitung dalam nilai aset aktif.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={ITEM_STATUS_BADGE[item.status]}>
          {ITEM_STATUS_LABELS[item.status]}
        </Badge>
        <Badge className={ITEM_CONDITION_BADGE[item.condition]}>
          {ITEM_CONDITION_LABELS[item.condition]}
        </Badge>
        <Badge className={ACQUISITION_SOURCE_BADGE[item.acquisitionSource]}>
          {ACQUISITION_SOURCE_LABELS[item.acquisitionSource]}
          {item.sourceBranch ? ` · ${item.sourceBranch.name}` : ""}
        </Badge>
        {warrantyLeft !== null && warrantyLeft >= 0 ? (
          <Badge
            className={
              warrantyLeft <= 14
                ? "bg-red-100 text-red-800 ring-red-600/20"
                : "bg-emerald-100 text-emerald-800 ring-emerald-600/20"
            }
          >
            Garansi {warrantyLeft} hari lagi
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Data barang" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailRow label="Kategori">{item.category?.name}</DetailRow>
              <DetailRow label="Unit pengelola">
                {item.department
                  ? `${item.department.name} (${item.department.code})`
                  : null}
              </DetailRow>
              <DetailRow label="Jenis barang">
                {itemTypeLabel(item.assetType) ?? "—"}
              </DetailRow>
              <DetailRow label="Merek">{item.brand?.name}</DetailRow>
              <DetailRow label="Model / tipe">{item.model}</DetailRow>
              <DetailRow label="Nomor seri">{item.serialNumber}</DetailRow>
              <DetailRow label="Jumlah">
                {formatNumber(item.quantity)} {item.unit}
              </DetailRow>
              <DetailRow label="Harga satuan">{formatRupiah(item.price)}</DetailRow>
              <DetailRow label="Total nilai">
                {formatRupiah(item.price * item.quantity)}
              </DetailRow>
              <DetailRow label="Tanggal beli">{formatDate(item.purchaseDate)}</DetailRow>
              <DetailRow label="Garansi sampai">{formatDate(item.warrantyUntil)}</DetailRow>
              <DetailRow label="Supplier">{item.supplier?.name}</DetailRow>
              <DetailRow label="No. invoice">{item.invoiceNo}</DetailRow>
              <DetailRow label="Sumber perolehan">
                {ACQUISITION_SOURCE_LABELS[item.acquisitionSource]}
              </DetailRow>
              <DetailRow label="Cabang pembeli">
                {item.sourceBranch?.name ?? "—"}
              </DetailRow>
              <DetailRow label="Pemilik aset">
                {item.ownerBranch?.name ?? "Kantor pusat"}
              </DetailRow>
              <DetailRow label="Lokasi">
                {[item.location?.name, item.location?.branch?.name]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </DetailRow>
              <DetailRow label="Dipegang oleh">{item.assignedTo}</DetailRow>
              {isDisposed ? (
                <DetailRow label="Tanggal dibuang">
                  {formatDate(item.disposedAt)}
                </DetailRow>
              ) : null}
              {isDisposed ? (
                <DetailRow label="Alasan dibuang">
                  {item.disposalReason ?? "—"}
                </DetailRow>
              ) : null}
              {isSold ? (
                <DetailRow label="Tanggal jual">
                  {formatDate(item.soldAt)}
                </DetailRow>
              ) : null}
              {isSold ? (
                <DetailRow label="Harga jual">
                  {formatRupiah(item.soldPrice)}
                </DetailRow>
              ) : null}
              <DetailRow label="Ditambahkan">{formatDateTime(item.createdAt)}</DetailRow>
              <DetailRow label="Terakhir diubah">{formatDateTime(item.updatedAt)}</DetailRow>
              <DetailRow label="Catatan">
                <span className="whitespace-pre-wrap">{item.notes}</span>
              </DetailRow>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Label QR"
            description="Dicetak & ditempel ke fisik barang."
          />
          <CardBody className="flex flex-col items-center gap-3 text-center">
            <div
              className="rounded-lg bg-white p-1 ring-1 ring-neutral-200 [&>svg]:h-40 [&>svg]:w-40"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <span className="font-mono text-sm font-semibold text-neutral-800">
              {item.code}
            </span>
            <ButtonLink
              href={`/items/${item.id}/label`}
              variant="outline"
              size="sm"
            >
              Cetak label
            </ButtonLink>
          </CardBody>
        </Card>

        {isDeleted ? null : (
          <MovementForm
            itemId={item.id}
            currentLocationId={item.locationId ?? ""}
            currentStatus={item.status}
            locations={master.locations}
          />
        )}
      </div>

      <Card>
        <CardHeader
          title="Riwayat pergerakan"
          description={`${movements.length} catatan, terbaru di atas.`}
        />
        <CardBody className="p-0">
          {movements.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              Belum ada pergerakan tercatat.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Waktu</th>
                    <th className="px-4 py-2.5 font-medium">Dari lokasi</th>
                    <th className="px-4 py-2.5 font-medium">Ke lokasi</th>
                    <th className="px-4 py-2.5 font-medium">Perubahan status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Jumlah</th>
                    <th className="px-4 py-2.5 font-medium">Oleh</th>
                    <th className="px-4 py-2.5 font-medium">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600">
                        {formatDateTime(movement.movedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {movement.fromLocation?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {movement.toLocation?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {movement.fromStatus
                          ? ITEM_STATUS_LABELS[movement.fromStatus]
                          : "—"}{" "}
                        →{" "}
                        {movement.toStatus
                          ? ITEM_STATUS_LABELS[movement.toStatus]
                          : "—"}
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
    </div>
  );
}

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ItemDetail params={params} />
    </Suspense>
  );
}

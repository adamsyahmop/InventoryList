import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { ITEM_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatNumber } from "@/lib/format";
import { listRecentMovements } from "@/lib/queries";

export const metadata: Metadata = { title: "Pergerakan" };

function MovementsSkeleton() {
  return <Card className="h-96 animate-pulse bg-neutral-100" />;
}

async function MovementsList() {
  const movements = await listRecentMovements(100);

  return (
    <Card>
      <CardHeader
        title="Riwayat pergerakan terbaru"
        description={`${movements.length} catatan terakhir dari seluruh barang.`}
      />
      <CardBody className="p-0">
        {movements.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">
            Belum ada pergerakan tercatat. Riwayat muncul setelah barang dipindahkan
            atau statusnya diubah.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Waktu</th>
                  <th className="px-4 py-2.5 font-medium">Barang</th>
                  <th className="px-4 py-2.5 font-medium">Dari</th>
                  <th className="px-4 py-2.5 font-medium">Ke</th>
                  <th className="px-4 py-2.5 text-right font-medium">Jumlah</th>
                  <th className="px-4 py-2.5 font-medium">Oleh</th>
                  <th className="px-4 py-2.5 font-medium">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {movements.map((movement) => (
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
  );
}

export default function MovementsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pergerakan Barang"
        description="Jejak audit perpindahan lokasi dan perubahan status barang."
      />
      <Suspense fallback={<MovementsSkeleton />}>
        <MovementsList />
      </Suspense>
    </div>
  );
}

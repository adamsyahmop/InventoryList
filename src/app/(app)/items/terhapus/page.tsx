import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { RestoreItemButton } from "@/components/items/restore-item-button";
import { ButtonLink } from "@/components/ui/button";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/card";
import { ITEM_STATUS_BADGE, ITEM_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { listDeletedItems } from "@/lib/queries";

export const metadata: Metadata = { title: "Sampah" };

function TrashSkeleton() {
  return <Card className="h-80 animate-pulse bg-neutral-100" />;
}

async function DeletedItems() {
  const items = await listDeletedItems();

  if (items.length === 0) {
    return (
      <EmptyState
        title="Sampah kosong"
        description="Barang yang dihapus akan muncul di sini dan masih bisa dipulihkan ke daftar aktif."
        action={<ButtonLink href="/items">Kembali ke daftar barang</ButtonLink>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        {items.length} barang terhapus. Datanya tidak dibuang permanen — riwayat
        pergerakan dan nilai perolehannya tetap tersimpan.
      </p>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">Kode</th>
              <th className="px-4 py-2.5 font-medium">Nama barang</th>
              <th className="px-4 py-2.5 font-medium">Dihapus</th>
              <th className="px-4 py-2.5 font-medium">Status terakhir</th>
              <th className="px-4 py-2.5 text-right font-medium">Nilai</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2.5 font-mono text-xs text-neutral-500">
                  {item.code}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/items/${item.id}`}
                    className="font-medium text-neutral-900 hover:text-indigo-600 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {[item.brand?.name, item.location?.name]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600">
                  {formatDateTime(item.deletedAt)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge className={ITEM_STATUS_BADGE[item.status]}>
                    {ITEM_STATUS_LABELS[item.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap text-neutral-700">
                  {formatRupiah(item.price * item.quantity)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end">
                    <RestoreItemButton id={item.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DeletedItemsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sampah"
        description="Barang yang dihapus dari daftar aktif. Pemulihan mengembalikan statusnya ke Tersedia."
      />
      <Suspense fallback={<TrashSkeleton />}>
        <DeletedItems />
      </Suspense>
    </div>
  );
}

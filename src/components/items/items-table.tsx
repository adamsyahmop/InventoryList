import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/card";
import {
  ACQUISITION_SOURCE_BADGE,
  ACQUISITION_SOURCE_LABELS,
  ITEM_CONDITION_BADGE,
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_BADGE,
  ITEM_STATUS_LABELS,
} from "@/lib/constants";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";
import type { ItemWithRelations } from "@/lib/queries";

export function ItemsTable({ items }: { items: ItemWithRelations[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Belum ada barang yang cocok"
        description="Coba ubah kata kunci atau filter, atau tambahkan barang baru ke inventaris."
        action={<ButtonLink href="/items/new">+ Tambah Barang</ButtonLink>}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full min-w-[72rem] text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
          <tr>
            <th className="px-4 py-2.5 font-medium">Kode</th>
            <th className="px-4 py-2.5 font-medium">Nama barang</th>
            <th className="px-4 py-2.5 font-medium">Kategori</th>
            <th className="px-4 py-2.5 font-medium">Unit pengelola</th>
            <th className="px-4 py-2.5 font-medium">Lokasi / cabang</th>
            <th className="px-4 py-2.5 font-medium">Sumber</th>
            <th className="px-4 py-2.5 font-medium">Tgl beli</th>
            <th className="px-4 py-2.5 text-right font-medium">Harga</th>
            <th className="px-4 py-2.5 font-medium">Kondisi</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
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
                  {[item.brand?.name, item.model].filter(Boolean).join(" · ") ||
                    "—"}
                  {item.quantity > 1 ? ` · ${formatNumber(item.quantity)} ${item.unit}` : ""}
                </p>
              </td>
              <td className="px-4 py-2.5 text-neutral-600">
                {item.category?.name ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-neutral-600">
                {item.department?.name ?? "—"}
                {item.department ? (
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {item.department.code}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-2.5 text-neutral-600">
                {item.location?.name ?? "—"}
                {item.location?.branch ? (
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {item.location.branch.name}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-2.5">
                <Badge className={ACQUISITION_SOURCE_BADGE[item.acquisitionSource]}>
                  {ACQUISITION_SOURCE_LABELS[item.acquisitionSource]}
                </Badge>
                {item.sourceBranch ? (
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {item.sourceBranch.name}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600">
                {formatDate(item.purchaseDate)}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap text-neutral-700">
                {formatRupiah(item.price)}
              </td>
              <td className="px-4 py-2.5">
                <Badge className={ITEM_CONDITION_BADGE[item.condition]}>
                  {ITEM_CONDITION_LABELS[item.condition]}
                </Badge>
              </td>
              <td className="px-4 py-2.5">
                <Badge className={ITEM_STATUS_BADGE[item.status]}>
                  {ITEM_STATUS_LABELS[item.status]}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

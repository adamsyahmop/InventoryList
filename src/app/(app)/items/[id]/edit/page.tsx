import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemForm, type ItemFormValues } from "@/components/items/item-form";
import { Card, PageHeader } from "@/components/ui/card";
import { toDateInputValue } from "@/lib/format";
import { getItem, getMasterData } from "@/lib/queries";

export const metadata: Metadata = { title: "Edit Barang" };

async function EditItemForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, master] = await Promise.all([getItem(id), getMasterData()]);

  // Barang yang sudah dihapus tidak boleh disunting: `updateItemAction` pun
  // menolaknya. Arahkan ke 404 daripada menampilkan form yang pasti gagal.
  if (!item || item.deletedAt) notFound();

  const values: ItemFormValues = {
    id: item.id,
    code: item.code,
    assetType: item.assetType ?? "",
    name: item.name,
    brandId: item.brandId ?? "",
    model: item.model ?? "",
    categoryId: item.categoryId ?? "",
    quantity: String(item.quantity),
    unit: item.unit,
    purchaseDate: toDateInputValue(item.purchaseDate),
    price: String(item.price),
    supplierId: item.supplierId ?? "",
    invoiceNo: item.invoiceNo ?? "",
    warrantyUntil: toDateInputValue(item.warrantyUntil),
    condition: item.condition,
    status: item.status,
    locationId: item.locationId ?? "",
    assignedTo: item.assignedTo ?? "",
    serialNumber: item.serialNumber ?? "",
    photoUrl: item.photoUrl ?? "",
    notes: item.notes ?? "",
    acquisitionSource: item.acquisitionSource,
    sourceBranchId: item.sourceBranchId ?? "",
    ownerBranchId: item.ownerBranchId ?? "",
    disposedAt: toDateInputValue(item.disposedAt),
    disposalReason: item.disposalReason ?? "",
    soldAt: toDateInputValue(item.soldAt),
    soldPrice: item.soldPrice === null ? "" : String(item.soldPrice),
  };

  return <ItemForm mode="edit" master={master} values={values} />;
}

export default function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Edit Barang"
        description="Perbarui data barang. Perubahan lokasi atau status akan tercatat sebagai pergerakan."
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Card className="h-64 animate-pulse bg-neutral-100" />
            <Card className="h-64 animate-pulse bg-neutral-100" />
          </div>
        }
      >
        <EditItemForm params={params} />
      </Suspense>
    </div>
  );
}

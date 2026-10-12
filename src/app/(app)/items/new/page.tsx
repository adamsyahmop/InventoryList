import { Suspense } from "react";
import type { Metadata } from "next";
import { ItemForm } from "@/components/items/item-form";
import { Card, PageHeader } from "@/components/ui/card";
import { getMasterData } from "@/lib/queries";

export const metadata: Metadata = { title: "Tambah Barang" };

async function NewItemForm() {
  const master = await getMasterData();
  return <ItemForm mode="create" master={master} />;
}

export default function NewItemPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tambah Barang"
        description="Lengkapi data barang, lalu simpan untuk membuat kode inventaris baru."
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Card className="h-64 animate-pulse bg-neutral-100" />
            <Card className="h-64 animate-pulse bg-neutral-100" />
          </div>
        }
      >
        <NewItemForm />
      </Suspense>
    </div>
  );
}

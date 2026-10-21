import { Suspense } from "react";
import type { Metadata } from "next";
import { ItemForm } from "@/components/items/item-form";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getMasterData } from "@/lib/queries";

export const metadata: Metadata = { title: "Tambah Barang" };

function ViewerNotice() {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-neutral-600">
          Akun viewer hanya bisa melihat data. Minta admin mengubah peran akun
          Anda untuk menambah atau mengubah barang.
        </p>
      </CardBody>
    </Card>
  );
}

async function NewItemForm() {
  // Viewer tidak diberi form yang pasti ditolak server: tampilkan alasannya.
  const actor = await getSession();
  if (actor?.role === "VIEWER") return <ViewerNotice />;

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

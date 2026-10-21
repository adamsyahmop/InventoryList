import { Suspense } from "react";
import type { Metadata } from "next";
import { OpnameStartForm } from "@/components/opname/opname-start-form";
import { ButtonLink } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getMasterData, listOpnames } from "@/lib/queries";

export const metadata: Metadata = { title: "Stock Opname" };

const STATUS_BADGE = {
  OPEN: "bg-amber-50 text-amber-700 ring-amber-600/20",
  CLOSED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
} as const;

function OpnameSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="h-64 animate-pulse bg-neutral-100" />
      <Card className="h-48 animate-pulse bg-neutral-100" />
    </div>
  );
}

async function OpnameSection() {
  const [opnames, master] = await Promise.all([listOpnames(), getMasterData()]);

  const branchName = new Map(master.branches.map((b) => [b.id, b.name]));
  const locations = master.locations.map((location) => ({
    id: location.id,
    name: location.name,
    branchName: location.branchId
      ? (branchName.get(location.branchId) ?? null)
      : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <OpnameStartForm
        branches={master.branches.map(({ id, name }) => ({ id, name }))}
        locations={locations}
      />

      <Card>
        <CardHeader
          title="Riwayat sesi"
          description="Sesi yang masih terbuka bisa dilanjutkan; sesi tertutup bersifat arsip."
        />
        <CardBody className="p-0">
          {opnames.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Belum ada sesi opname"
                description="Mulai sesi pertama lewat form di atas. Lingkupnya bisa seluruh barang, satu cabang, atau satu lokasi."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Kode</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Lingkup</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Mulai</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Progress</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Selisih</th>
                    <th scope="col" className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {opnames.map((opname) => (
                    <tr key={opname.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-neutral-700">
                        {opname.code}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700">
                        {opname.scopeLabel}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600">
                        {formatDateTime(opname.startedAt)}
                        {opname.closedAt ? (
                          <span className="block text-xs text-neutral-400">
                            {`ditutup ${formatDateTime(opname.closedAt)}`}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={STATUS_BADGE[opname.status]}>
                          {opname.status === "OPEN" ? "Berjalan" : "Tertutup"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {`${opname.countedCount}/${opname.lineCount} dihitung`}
                      </td>
                      <td className="px-4 py-2.5 text-right text-neutral-600">
                        {opname.differenceCount}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ButtonLink
                          href={`/opname/${opname.id}`}
                          variant="outline"
                          size="sm"
                        >
                          {opname.status === "OPEN" ? "Lanjutkan" : "Lihat"}
                        </ButtonLink>
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

export default function OpnamePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock Opname"
        description="Cocokkan stok sistem dengan hitungan fisik. Selisih diterapkan ke stok saat sesi ditutup."
        action={
          <ButtonLink href="/movements" variant="outline">
            Riwayat pergerakan
          </ButtonLink>
        }
      />
      <Suspense fallback={<OpnameSkeleton />}>
        <OpnameSection />
      </Suspense>
    </div>
  );
}

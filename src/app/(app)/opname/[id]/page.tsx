import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  OpnameCloseForm,
  OpnameCountForm,
} from "@/components/opname/opname-count-form";
import { ButtonLink } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui/card";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getOpname } from "@/lib/queries";

export const metadata: Metadata = { title: "Lembar Stock Opname" };

type Params = Promise<{ id: string }>;

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="h-32 animate-pulse bg-neutral-100" />
      <Card className="h-96 animate-pulse bg-neutral-100" />
    </div>
  );
}

async function OpnameDetail({ params }: { params: Params }) {
  const { id } = await params;
  const opname = await getOpname(id);
  if (!opname) notFound();

  const counted = opname.lines.filter((line) => line.countedQty !== null);
  const differences = counted.filter(
    (line) => line.countedQty !== line.expectedQty,
  );
  const isOpen = opname.status === "OPEN";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-neutral-500">Status</p>
            <Badge
              className={
                isOpen
                  ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              }
            >
              {isOpen ? "Berjalan" : "Tertutup"}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Lingkup</p>
            <p className="text-sm text-neutral-800">{opname.scopeLabel}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Progress</p>
            <p className="text-sm text-neutral-800">
              {`${counted.length}/${opname.lines.length} baris dihitung`}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Selisih ditemukan</p>
            <p className="text-sm text-neutral-800">{`${differences.length} barang`}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-neutral-500">Mulai</p>
            <p className="text-sm text-neutral-800">
              {formatDateTime(opname.startedAt)}
            </p>
          </div>
          {opname.closedAt ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-neutral-500">Ditutup</p>
              <p className="text-sm text-neutral-800">
                {formatDateTime(opname.closedAt)}
              </p>
            </div>
          ) : null}
          {opname.note ? (
            <div className="sm:col-span-4">
              <p className="text-xs text-neutral-500">Catatan</p>
              <p className="text-sm text-neutral-800">{opname.note}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {isOpen ? (
        <>
          <Card>
            <CardHeader
              title="Lembar hitung"
              description="Isi jumlah fisik yang benar-benar ditemukan. Kosongkan baris yang belum diperiksa."
            />
            <CardBody>
              <OpnameCountForm opnameId={opname.id} lines={opname.lines} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Tutup sesi"
              description="Stok sistem mengikuti hasil hitung; selisih dicatat sebagai pergerakan."
            />
            <CardBody>
              <OpnameCloseForm
                opnameId={opname.id}
                countedCount={counted.length}
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader
            title="Hasil opname"
            description="Sesi sudah ditutup. Stok sistem sudah disesuaikan dan tidak bisa diubah dari sini."
          />
          <CardBody className="flex flex-col gap-3 p-0">
            {differences.length === 0 ? (
              <div className="px-4 pt-4">
                <Alert tone="success">
                  Tidak ada selisih pada baris yang dihitung.
                </Alert>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Barang</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Sistem</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Fisik</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Selisih</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {opname.lines.map((line) => {
                    const diff =
                      line.countedQty === null
                        ? null
                        : line.countedQty - line.expectedQty;

                    return (
                      <tr key={line.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2.5">
                          {line.itemId ? (
                            <Link
                              href={`/items/${line.itemId}`}
                              className="font-medium text-neutral-900 hover:text-indigo-600 hover:underline"
                            >
                              {line.itemName}
                            </Link>
                          ) : (
                            <span className="font-medium text-neutral-900">
                              {line.itemName}
                            </span>
                          )}
                          <p className="font-mono text-xs text-neutral-400">
                            {line.itemCode}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-600">
                          {formatNumber(line.expectedQty)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-600">
                          {line.countedQty === null
                            ? "belum"
                            : formatNumber(line.countedQty)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {diff === null ? (
                            <span className="text-neutral-400">—</span>
                          ) : diff === 0 ? (
                            <span className="text-neutral-500">0</span>
                          ) : (
                            <span
                              className={
                                diff > 0
                                  ? "font-medium text-emerald-700"
                                  : "font-medium text-red-700"
                              }
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-500">
                          {line.note ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function OpnameDetailPage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lembar Stock Opname"
        description="Stok sistem adalah angka saat sesi dimulai, bukan angka terkini."
        action={
          <ButtonLink href="/opname" variant="outline">
            Kembali ke daftar
          </ButtonLink>
        }
      />
      <Suspense fallback={<DetailSkeleton />}>
        <OpnameDetail params={params} />
      </Suspense>
    </div>
  );
}

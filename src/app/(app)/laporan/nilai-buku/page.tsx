import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { ITEM_STATUS_BADGE, ITEM_STATUS_LABELS, isInactiveStatus } from "@/lib/constants";
import {
  DEFAULT_USEFUL_LIFE_MONTHS,
  depreciationFor,
  disposalOutcome,
} from "@/lib/depreciation";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";
import { getBookValueItems } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Nilai Buku" };

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: tone }} />
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold text-neutral-900 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </Card>
  );
}

function Rupiah({ value }: { value: number }) {
  return <span className="tabular-nums">{formatRupiah(value)}</span>;
}

async function BookValueReport() {
  // `new Date()` adalah nilai runtime: tandai halaman ini dinamis, kalau tidak
  // prerender PPR gagal ("blocking-prerender-current-time").
  await connection();

  const items = await getBookValueItems();
  const now = new Date();

  const active = items.filter((item) => !isInactiveStatus(item.status));
  const released = items.filter((item) => isInactiveStatus(item.status));

  const unsorted = active.map((item) => ({
    item,
    calc: depreciationFor(
      {
        price: item.price,
        quantity: item.quantity,
        purchaseDate: item.purchaseDate,
        status: item.status,
        usefulLifeMonths: item.category?.usefulLifeMonths ?? null,
      },
      now,
    ),
  }));

  // Nilai buku terbesar di atas: yang paling perlu perhatian saat audit.
  const rows = [...unsorted].sort((a, b) => b.calc.bookValue - a.calc.bookValue);

  const totals = rows.reduce(
    (acc, { calc }) => ({
      cost: acc.cost + calc.cost,
      accumulated: acc.accumulated + calc.accumulated,
      bookValue: acc.bookValue + calc.bookValue,
    }),
    { cost: 0, accumulated: 0, bookValue: 0 },
  );
  const { cost, accumulated, bookValue } = totals;
  const missingDate = rows.filter(({ calc }) => !calc.hasPurchaseDate).length;
  const fullyDepreciated = rows.filter(({ calc }) => calc.fullyDepreciated).length;

  const disposals = released.map((item) => ({
    item,
    outcome: disposalOutcome(
      {
        price: item.price,
        quantity: item.quantity,
        purchaseDate: item.purchaseDate,
        status: item.status,
        soldAt: item.soldAt,
        soldPrice: item.soldPrice,
        disposedAt: item.disposedAt,
        usefulLifeMonths: item.category?.usefulLifeMonths ?? null,
      },
      now,
    ),
  }));

  const totalGainLoss = disposals.reduce((sum, row) => sum + row.outcome.gainLoss, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Nilai perolehan aktif"
          value={formatRupiah(cost)}
          hint={`${formatNumber(active.length)} barang, harga × jumlah`}
          tone="#6366f1"
        />
        <Stat
          label="Akumulasi penyusutan"
          value={formatRupiah(accumulated)}
          hint="garis lurus, per bulan penuh"
          tone="#f97316"
        />
        <Stat
          label="Nilai buku"
          value={formatRupiah(bookValue)}
          hint={`${fullyDepreciated} barang sudah habis umur ekonomis`}
          tone="#059669"
        />
        <Stat
          label="Selisih pelepasan"
          value={`${totalGainLoss >= 0 ? "+" : "−"}${formatRupiah(Math.abs(totalGainLoss))}`}
          hint={`${disposals.length} barang dilepas (jual/buang)`}
          tone={totalGainLoss >= 0 ? "#0ea5e9" : "#dc2626"}
        />
      </div>

      {missingDate > 0 ? (
        <Alert tone="info">
          {missingDate} barang belum punya tanggal perolehan, jadi tidak bisa
          disusutkan. Nilai bukunya dihitung sama dengan harga perolehan.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Nilai buku per barang"
          description={`Garis lurus per bulan; umur ekonomis bawaan ${DEFAULT_USEFUL_LIFE_MONTHS} bulan bila kategori tidak mengisinya.`}
        />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">
              Belum ada barang aktif untuk dihitung.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Barang</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Kategori</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Perolehan</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Umur</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Harga</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Penyusutan</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Nilai buku</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map(({ item, calc }) => (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50"
                      data-item-code={item.code}
                      data-book-value={calc.bookValue}
                      data-accumulated={calc.accumulated}
                      data-cost={calc.cost}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/items/${item.id}`}
                          className="font-medium text-neutral-900 hover:text-indigo-700"
                        >
                          {item.name}
                        </Link>
                        <p className="font-mono text-xs text-neutral-500">
                          {item.code}
                          {item.quantity > 1 ? ` × ${item.quantity} unit` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {item.category?.name ?? "—"}
                        <p className="text-xs text-neutral-400">
                          {calc.usefulLifeMonths} bln
                        </p>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {item.purchaseDate ? formatDate(item.purchaseDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                        {calc.hasPurchaseDate ? `${calc.ageMonths} bln` : "—"}
                        {calc.fullyDepreciated ? (
                          <p className="text-xs text-orange-600">habis</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Rupiah value={calc.cost} />
                      </td>
                      <td className="px-4 py-3 text-right text-orange-700">
                        <Rupiah value={calc.accumulated} />
                        <p className="text-xs text-neutral-400">
                          {formatRupiah(calc.monthlyPerUnit)}/bln/unit
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-neutral-900">
                        <Rupiah value={calc.bookValue} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={ITEM_STATUS_BADGE[item.status]}>
                          {ITEM_STATUS_LABELS[item.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm font-medium">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={4}>
                      Total {formatNumber(active.length)} barang aktif
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Rupiah value={cost} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-orange-700">
                      <Rupiah value={accumulated} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Rupiah value={bookValue} />
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Hasil pelepasan vs nilai buku"
          description="Nilai buku dihitung sampai tanggal jual/buang, bukan hari ini — supaya laba/rugi tidak berubah tiap kali laporan dibuka."
        />
        <CardBody className="p-0">
          {disposals.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">
              Belum ada barang yang dijual atau dibuang.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Barang</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Tanggal</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Harga perolehan</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Nilai buku saat lepas</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Hasil penjualan</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Laba / rugi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {disposals.map(({ item, outcome }) => (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50"
                      data-item-code={item.code}
                      data-gain-loss={outcome.gainLoss}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/items/${item.id}`}
                          className="font-medium text-neutral-900 hover:text-indigo-700"
                        >
                          {item.name}
                        </Link>
                        <p className="font-mono text-xs text-neutral-500">{item.code}</p>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {outcome.releasedAt ? formatDate(outcome.releasedAt) : "—"}
                        <p className="text-xs text-neutral-400">
                          {ITEM_STATUS_LABELS[item.status]}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Rupiah value={item.price * item.quantity} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Rupiah value={outcome.bookValueAtRelease} />
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600">
                        {outcome.saleProceeds === null ? "—" : <Rupiah value={outcome.saleProceeds} />}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-medium",
                          outcome.gainLoss >= 0 ? "text-emerald-700" : "text-red-700",
                        )}
                      >
                        {outcome.gainLoss >= 0 ? "+" : "−"}
                        <Rupiah value={Math.abs(outcome.gainLoss)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm font-medium">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={5}>
                      Total {formatNumber(disposals.length)} barang dilepas
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right",
                        totalGainLoss >= 0 ? "text-emerald-700" : "text-red-700",
                      )}
                    >
                      {totalGainLoss >= 0 ? "+" : "−"}
                      <Rupiah value={Math.abs(totalGainLoss)} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Card key={key} className="h-24 animate-pulse bg-neutral-100" />
        ))}
      </div>
      <Card className="h-64 animate-pulse bg-neutral-100" />
    </div>
  );
}

export default function BookValuePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nilai Buku"
        description="Penyusutan garis lurus per bulan, dihitung dari harga perolehan dan umur ekonomis kategori."
      />
      <Suspense fallback={<Skeleton />}>
        <BookValueReport />
      </Suspense>
    </div>
  );
}

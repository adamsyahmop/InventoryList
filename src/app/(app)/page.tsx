import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ButtonLink } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui/card";
import {
  ITEM_STATUS_BADGE,
  ITEM_STATUS_BAR,
  ITEM_STATUS_LABELS,
} from "@/lib/constants";
import { daysUntil, formatDate, formatNumber, formatRupiah } from "@/lib/format";
import { getDashboardStats, listExpiringWarranty } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-400">{hint}</p> : null}
    </Card>
  );
}

/**
 * Bar proporsi sederhana. Lebarnya relatif terhadap `max`, jadi `max` biasanya
 * total keseluruhan supaya panjang bar langsung terbaca sebagai persentase.
 */
function Bar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className={cn("h-full rounded-full bg-indigo-500", className)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="h-[92px] animate-pulse bg-neutral-100" />
        ))}
      </div>
      <Card className="h-64 animate-pulse bg-neutral-100" />
    </div>
  );
}

async function DashboardContent() {
  // `connection()` menandai boundary ini dirender saat request, bukan saat
  // prerender. Diperlukan karena kartu "Garansi segera habis" memakai
  // `daysUntil()` yang membaca waktu sekarang (`new Date()`); Cache Components
  // menolak nilai waktu yang tidak stabil di dalam shell statis.
  // Data sendiri tetap dilayani dari cache `"use cache"` di `queries.ts`.
  await connection();

  const [stats, expiring] = await Promise.all([
    getDashboardStats(),
    listExpiringWarranty(60),
  ]);

  const byStatusDesc = stats.byStatus
    .slice()
    .sort((a, b) => b.count - a.count);
  // Bar diukur terhadap seluruh barang, jadi panjangnya langsung terbaca
  // sebagai "berapa persen dari total inventaris".
  const maxStatusCount = Math.max(1, stats.totalItems);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Jenis barang"
          value={formatNumber(stats.totalItems)}
          hint={`${formatNumber(stats.totalQuantity)} unit total`}
        />
        <StatCard
          label="Nilai aset aktif"
          value={formatRupiah(stats.activeValue)}
          hint={`Dari ${formatRupiah(stats.totalValue)} nilai perolehan`}
        />
        <StatCard
          label="Kategori terpakai"
          value={formatNumber(stats.usedCategoryCount)}
          hint={`dari ${formatNumber(stats.totalCategories)} kategori terdaftar`}
        />
        <StatCard
          label="Perlu perhatian"
          value={formatNumber(stats.needsAttentionCount)}
          hint={stats.attentionHint || "Tidak ada yang mendesak"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Status barang"
            description="Sebaran kondisi kepemilikan. Klik untuk melihat barangnya."
          />
          <CardBody className="flex flex-col gap-0.5">
            {byStatusDesc.length === 0 ? (
              <p className="text-sm text-neutral-500">Belum ada data.</p>
            ) : (
              byStatusDesc.map((row) => (
                <Link
                  key={row.status}
                  href={`/items?status=${row.status}`}
                  className="flex flex-col gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge className={ITEM_STATUS_BADGE[row.status]}>
                      {ITEM_STATUS_LABELS[row.status]}
                    </Badge>
                    <span className="text-sm font-medium text-neutral-700">
                      {formatNumber(row.count)}
                      <span className="ml-1.5 text-xs font-normal text-neutral-400">
                        {Math.round((row.count / maxStatusCount) * 100)}%
                      </span>
                    </span>
                  </div>
                  <Bar
                    value={row.count}
                    max={maxStatusCount}
                    className={ITEM_STATUS_BAR[row.status]}
                  />
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Barang per kategori"
            description="Jumlah jenis, nilai, dan porsi terhadap nilai aset aktif. Klik nama kategori untuk melihat barangnya."
          />
          <CardBody className="p-0">
            {stats.categoryBreakdown.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">Belum ada data.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 font-medium">Kategori</th>
                    <th className="px-4 py-2 text-right font-medium">Jenis</th>
                    <th className="px-4 py-2 text-right font-medium">Nilai</th>
                    <th className="px-4 py-2 text-right font-medium">Porsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {stats.categoryBreakdown.map((row) => {
                    const share =
                      stats.activeValue > 0
                        ? Math.round((row.value / stats.activeValue) * 100)
                        : 0;
                    return (
                      <tr key={row.name}>
                        <td className="px-4 py-2 text-neutral-800">
                          {row.id ? (
                            <Link
                              href={`/items?categoryId=${row.id}`}
                              className="hover:text-indigo-600 hover:underline"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            row.name
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-neutral-600">
                          {formatNumber(row.count)}
                        </td>
                        <td className="px-4 py-2 text-right text-neutral-600">
                          {formatRupiah(row.value)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <span className="w-9 shrink-0 text-right text-xs text-neutral-500">
                              {share}%
                            </span>
                            <div className="w-20">
                              <Bar value={row.value} max={stats.activeValue} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Nilai aset aktif per cabang"
            description={`Menurut pemilik aset, bukan lokasi fisik. Kosong berarti aset tetap milik kantor pusat. ${formatNumber(stats.branchCount)} cabang terdaftar.`}
          />
          <CardBody className="p-0">
            {stats.branchBreakdown.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">Belum ada data.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 font-medium">Cabang</th>
                    <th className="px-4 py-2 text-right font-medium">Jenis</th>
                    <th className="px-4 py-2 text-right font-medium">Nilai aset</th>
                    <th className="px-4 py-2 text-right font-medium">Porsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {stats.branchBreakdown.map((row) => {
                    const share =
                      stats.activeValue > 0
                        ? Math.round((row.value / stats.activeValue) * 100)
                        : 0;
                    return (
                      <tr key={row.name}>
                        <td className="px-4 py-2 text-neutral-800">{row.name}</td>
                        <td className="px-4 py-2 text-right text-neutral-600">
                          {formatNumber(row.count)}
                        </td>
                        <td className="px-4 py-2 text-right text-neutral-600">
                          {formatRupiah(row.value)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <span className="w-9 shrink-0 text-right text-xs text-neutral-500">
                              {share}%
                            </span>
                            <div className="w-20">
                              <Bar value={row.value} max={stats.activeValue} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Pelepasan aset"
            description="Barang yang sudah keluar dari daftar aktif."
          />
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-600">Nilai perolehan</span>
              <span className="text-sm font-medium text-neutral-800">
                {formatRupiah(stats.totalValue)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-600">Dibuang</span>
              <span className="text-sm font-medium text-neutral-800">
                {formatRupiah(stats.disposedValue)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-600">Dijual</span>
              <span className="text-sm font-medium text-neutral-800">
                {formatRupiah(stats.soldValue)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
              <span className="text-sm text-neutral-600">Hasil penjualan</span>
              <span className="text-sm font-medium text-emerald-700">
                {formatRupiah(stats.soldProceeds)}
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Nilai aset aktif = nilai perolehan − dibuang − dijual. Harga beli
              barang yang sudah dilepas tetap tersimpan untuk audit.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Barang terbaru"
            action={
              <ButtonLink href="/items" variant="ghost" size="sm">
                Lihat semua
              </ButtonLink>
            }
          />
          <CardBody className="p-0">
            {stats.recentItems.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">Belum ada barang.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {stats.recentItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-800">
                        {item.name}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
                        <span className="font-mono">{item.code}</span>
                        {` · ${formatNumber(item.quantity)} ${item.unit}`}
                        {item.category ? ` · ${item.category.name}` : ""}
                        {item.location?.branch
                          ? ` · ${item.location.branch.name}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-neutral-600">
                        {formatRupiah(item.price)}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {`per ${item.unit}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Garansi segera habis"
            description="Dalam 60 hari ke depan."
          />
          <CardBody className="p-0">
            {expiring.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">
                Tidak ada garansi yang akan habis.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {expiring.map((item) => {
                  const remaining = daysUntil(item.warrantyUntil) ?? 0;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-800">
                          {item.name}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {formatDate(item.warrantyUntil)}
                          {item.location ? ` · ${item.location.name}` : ""}
                        </p>
                      </div>
                      <Badge
                        className={
                          remaining <= 14
                            ? "bg-red-100 text-red-800 ring-red-600/20"
                            : "bg-amber-100 text-amber-800 ring-amber-600/20"
                        }
                      >
                        {remaining} hari
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Ringkasan inventaris barang."
        action={<ButtonLink href="/items/new">+ Tambah Barang</ButtonLink>}
      />
      <Suspense fallback={<Skeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}


import { cacheLife, cacheTag } from "next/cache";
import type {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { ITEMS_PER_PAGE, isInactiveStatus } from "./constants";
import { prisma } from "./prisma";

/**
 * Tag cache dipakai oleh Server Actions lewat `updateTag()` supaya pembacaan
 * setelah mutasi langsung segar (read-your-own-writes).
 */
export const CACHE_TAGS = {
  items: "items",
  movements: "movements",
  master: "master",
  dashboard: "dashboard",
} as const;

/**
 * Bentuk relasi yang selalu dibutuhkan daftar/detail barang. Cabang muncul
 * tiga kali dengan peran berbeda: lokasi fisik, cabang pembeli, dan pemilik.
 */
const ITEM_INCLUDE = {
  category: true,
  brand: true,
  supplier: true,
  sourceBranch: true,
  ownerBranch: true,
  location: { include: { branch: true } },
} as const;

export type ItemWithRelations = Prisma.ItemGetPayload<{
  include: typeof ITEM_INCLUDE;
}>;

export type ItemSort = "newest" | "oldest" | "name" | "price_desc" | "price_asc";

export type ItemFilters = {
  q?: string;
  status?: ItemStatus | "";
  condition?: ItemCondition | "";
  categoryId?: string;
  locationId?: string;
  /** Filter cabang memakai cabang LOKASI (barang ada di mana). */
  branchId?: string;
  acquisitionSource?: AcquisitionSource | "";
  sort?: ItemSort;
  page?: number;
};

export type ItemListResult = {
  items: ItemWithRelations[];
  total: number;
  page: number;
  pageCount: number;
};

const SORT_MAP: Record<ItemSort, Prisma.ItemOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  oldest: [{ createdAt: "asc" }],
  name: [{ name: "asc" }],
  price_desc: [{ price: "desc" }],
  price_asc: [{ price: "asc" }],
};

export async function listItems(filters: ItemFilters): Promise<ItemListResult> {
  "use cache";
  cacheTag(CACHE_TAGS.items);
  cacheLife("minutes");

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const q = filters.q?.trim().toLowerCase() ?? "";

  // searchKey sudah lowercase sejak ditulis, jadi `contains` di sini
  // berperilaku sama di SQLite maupun PostgreSQL.
  const where: Prisma.ItemWhereInput = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.condition ? { condition: filters.condition } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.branchId ? { location: { branchId: filters.branchId } } : {}),
    ...(filters.acquisitionSource
      ? { acquisitionSource: filters.acquisitionSource }
      : {}),
    ...(q ? { searchKey: { contains: q } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.item.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: SORT_MAP[filters.sort ?? "newest"],
      skip: (page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
    }),
    prisma.item.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
  };
}

export async function getItem(id: string) {
  "use cache";
  cacheTag(CACHE_TAGS.items);
  cacheLife("minutes");

  // Detail tetap boleh dibuka untuk item soft-deleted supaya pengguna dapat
  // melihat alasan penghapusan dan memulihkannya dari halaman Sampah.
  return prisma.item.findUnique({
    where: { id },
    include: ITEM_INCLUDE,
  });
}

export async function listDeletedItems() {
  "use cache";
  cacheTag(CACHE_TAGS.items);
  cacheLife("minutes");

  return prisma.item.findMany({
    where: { deletedAt: { not: null } },
    include: ITEM_INCLUDE,
    orderBy: { deletedAt: "desc" },
  });
}

export async function getItemMovements(itemId: string) {
  "use cache";
  cacheTag(CACHE_TAGS.movements);
  cacheLife("minutes");

  return prisma.itemMovement.findMany({
    where: { itemId },
    include: { fromLocation: true, toLocation: true },
    orderBy: { movedAt: "desc" },
  });
}

export async function listRecentMovements(take = 50) {
  "use cache";
  cacheTag(CACHE_TAGS.movements);
  cacheLife("minutes");

  return prisma.itemMovement.findMany({
    include: {
      item: { select: { id: true, code: true, name: true } },
      fromLocation: true,
      toLocation: true,
    },
    orderBy: { movedAt: "desc" },
    take,
  });
}

/** Semua data master sekaligus, dipakai untuk mengisi dropdown di form. */
export async function getMasterData() {
  "use cache";
  cacheTag(CACHE_TAGS.master);
  cacheLife("minutes");

  const [categories, brands, locations, suppliers, branches] =
    await prisma.$transaction([
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
      prisma.location.findMany({ orderBy: { name: "asc" } }),
      prisma.supplier.findMany({ orderBy: { name: "asc" } }),
      prisma.branch.findMany({ orderBy: { name: "asc" } }),
    ]);

  return { categories, brands, locations, suppliers, branches };
}

export async function getDashboardStats() {
  "use cache";
  cacheTag(CACHE_TAGS.items, CACHE_TAGS.dashboard, CACHE_TAGS.master);
  cacheLife("minutes");

  const notDeleted: Prisma.ItemWhereInput = { deletedAt: null };

  // Catatan: `groupBy` tidak bisa ditaruh di dalam array `$transaction([...])`
  // karena inferensi literal tipe Prisma 7 melebar dan hasilnya kehilangan
  // tipe `_count` / `_sum`. `Promise.all` memberi hasil yang sama tanpa
  // masalah tipe tersebut.
  const [totalItems, totalQuantity, byStatus, recent, categories, branches, valueRows] =
    await Promise.all([
      prisma.item.count({ where: notDeleted }),
      prisma.item.aggregate({ where: notDeleted, _sum: { quantity: true } }),
      prisma.item.groupBy({
        by: ["status"],
        orderBy: { status: "asc" },
        where: notDeleted,
        _count: { _all: true },
      }),
      prisma.item.findMany({
        where: notDeleted,
        include: { category: true, location: { include: { branch: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.branch.findMany({ orderBy: { name: "asc" } }),
      // `price` adalah HARGA SATUAN (label form: "Harga satuan (Rp)"), jadi
      // nilai inventaris = `price * quantity` — konsisten dengan "Total nilai"
      // di halaman detail barang. `aggregate` / `groupBy` Prisma tidak bisa
      // mengalikan dua kolom sekaligus, jadi barisnya diambil lalu dijumlahkan
      // di JS. Tetap portabel untuk SQLite maupun PostgreSQL.
      prisma.item.findMany({
        where: notDeleted,
        select: {
          price: true,
          quantity: true,
          categoryId: true,
          status: true,
          condition: true,
          ownerBranchId: true,
          soldPrice: true,
        },
      }),
    ]);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const lineValue = (row: { price: number; quantity: number }) =>
    row.price * row.quantity;

  const sumValue = (rows: Array<{ price: number; quantity: number }>) =>
    rows.reduce((sum, row) => sum + lineValue(row), 0);

  // "Nilai perolehan" mencakup semuanya; "nilai aset aktif" mengeluarkan
  // barang yang sudah dibuang/dijual. Record-nya tetap tersimpan supaya
  // riwayat & audit tidak hilang.
  const totalValue = sumValue(valueRows);
  const activeRows = valueRows.filter((row) => !isInactiveStatus(row.status));
  const disposedRows = valueRows.filter((row) => row.status === "DISPOSED");
  const soldRows = valueRows.filter((row) => row.status === "SOLD");

  const activeValue = sumValue(activeRows);
  const disposedValue = sumValue(disposedRows);
  const soldValue = sumValue(soldRows);
  // Uang yang benar-benar kembali dari penjualan (bukan harga beli).
  const soldProceeds = soldRows.reduce((sum, row) => sum + (row.soldPrice ?? 0), 0);

  // Rincian kategori & cabang dihitung dari aset AKTIF saja supaya kolom
  // "Porsi" benar-benar berjumlah 100% dari nilai yang masih dimiliki.
  const byCategory = new Map<string, { count: number; value: number }>();
  for (const row of activeRows) {
    const key = row.categoryId ?? "";
    const entry = byCategory.get(key) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += lineValue(row);
    byCategory.set(key, entry);
  }

  const categoryBreakdown = [...byCategory.entries()]
    .map(([categoryId, entry]) => ({
      id: categoryId || null,
      name: categoryId
        ? (categoryNames.get(categoryId) ?? "Tanpa kategori")
        : "Tanpa kategori",
      count: entry.count,
      value: entry.value,
    }))
    .sort((a, b) => b.value - a.value);

  // Aset per cabang memakai dimensi KEPEMILIKAN (`ownerBranchId`), bukan
  // lokasi fisik: barang bisa dibeli pusat tapi menjadi aset cabang.
  const byBranch = new Map<string, { count: number; value: number }>();
  for (const row of activeRows) {
    const key = row.ownerBranchId ?? "";
    const entry = byBranch.get(key) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += lineValue(row);
    byBranch.set(key, entry);
  }

  const branchBreakdown = [...byBranch.entries()]
    .map(([branchId, entry]) => ({
      id: branchId || null,
      name: branchId
        ? (branchNames.get(branchId) ?? "Cabang tidak dikenal")
        : "Kantor pusat",
      count: entry.count,
      value: entry.value,
    }))
    .sort((a, b) => b.value - a.value);

  // Barang yang butuh tindakan: sedang diperbaiki, hilang, atau kondisinya
  // rusak padahal statusnya masih aktif. Barang yang sudah DISPOSED / SOLD
  // tidak dihitung karena urusannya sudah selesai.
  const needsAttention = valueRows.filter(
    (row) =>
      row.status === "MAINTENANCE" ||
      row.status === "LOST" ||
      ((row.condition === "NEEDS_REPAIR" || row.condition === "DAMAGED") &&
        !isInactiveStatus(row.status)),
  );

  const attentionHint = [
    {
      count: needsAttention.filter((row) => row.status === "MAINTENANCE").length,
      label: "perbaikan",
    },
    {
      count: needsAttention.filter((row) => row.status === "LOST").length,
      label: "hilang",
    },
    {
      count: needsAttention.filter(
        (row) => row.status !== "MAINTENANCE" && row.status !== "LOST",
      ).length,
      label: "rusak",
    },
  ]
    .filter((part) => part.count > 0)
    .map((part) => `${part.count} ${part.label}`)
    .join(" · ");

  return {
    totalItems,
    totalQuantity: totalQuantity._sum.quantity ?? 0,
    totalValue,
    activeValue,
    disposedValue,
    soldValue,
    soldProceeds,
    totalCategories: categories.length,
    usedCategoryCount: categoryBreakdown.length,
    branchCount: branches.length,
    needsAttentionCount: needsAttention.length,
    attentionHint,
    byStatus: byStatus.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    categoryBreakdown,
    branchBreakdown,
    recentItems: recent,
  };
}

/** Barang yang garansinya habis dalam N hari ke depan. */
export async function listExpiringWarranty(days = 60) {
  "use cache";
  cacheTag(CACHE_TAGS.items);
  cacheLife("minutes");

  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);

  return prisma.item.findMany({
    where: { deletedAt: null, warrantyUntil: { gte: now, lte: until } },
    include: { location: true },
    orderBy: { warrantyUntil: "asc" },
  });
}


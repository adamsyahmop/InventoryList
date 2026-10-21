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
  opnames: "opnames",
  users: "users",
} as const;

/**
 * Bentuk relasi yang selalu dibutuhkan daftar/detail barang. Cabang muncul
 * tiga kali dengan peran berbeda: lokasi fisik, cabang pembeli, dan pemilik.
 * Dipakai juga oleh ekspor Excel (`/api/export`) supaya tipe baris yang
 * dikirim ke `buildInventoryWorkbook()` tidak pernah menyimpang dari
 * `ItemWithRelations`.
 */
export const ITEM_INCLUDE = {
  category: true,
  department: true,
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
  /** Unit pengelola (mis. IT / GA), dimensi bebas dari kategori. */
  departmentId?: string;
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

/**
 * Rumus filter daftar barang, dipakai bersama oleh halaman `/items` dan ekspor
 * `/api/export`. Satu rumus supaya berkas yang diunduh berisi barang yang sama
 * dengan yang terlihat di layar — kalau aturannya ditulis dua kali, cepat atau
 * lambat keduanya berbeda.
 */
export function buildItemWhere(filters: ItemFilters): Prisma.ItemWhereInput {
  const q = filters.q?.trim().toLowerCase() ?? "";

  return {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.condition ? { condition: filters.condition } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.branchId ? { location: { branchId: filters.branchId } } : {}),
    ...(filters.acquisitionSource
      ? { acquisitionSource: filters.acquisitionSource }
      : {}),
    ...(q ? { searchKey: { contains: q } } : {}),
  };
}

export function itemOrderBy(
  sort: ItemSort | undefined,
): Prisma.ItemOrderByWithRelationInput[] {
  return SORT_MAP[sort ?? "newest"];
}

export async function listItems(filters: ItemFilters): Promise<ItemListResult> {
  "use cache";
  cacheTag(CACHE_TAGS.items);
  cacheLife("minutes");

  const page = Math.max(1, Math.floor(filters.page ?? 1));

  // searchKey sudah lowercase sejak ditulis, jadi `contains` di sana berperilaku
  // sama di SQLite maupun PostgreSQL (lihat `buildItemWhere`).
  const where = buildItemWhere(filters);

  const [items, total] = await prisma.$transaction([
    prisma.item.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: itemOrderBy(filters.sort),
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

/**
 * Filter riwayat pergerakan. `status` memakai **status akhir** (`toStatus`) —
 * pertanyaan yang biasa diajukan saat audit: "apa saja yang berakhir di
 * Perbaikan?". Perbandingan lokasi lama vs baru tidak bisa dilakukan di SQL
 * tanpa kolom turunan, jadi tidak dijanjikan di sini.
 */
export type MovementFilters = {
  q?: string;
  reason?: string;
  status?: ItemStatus | "";
  /** Tanggal `yyyy-mm-dd`, inklusif. */
  from?: string;
  to?: string;
  page?: number;
};

export const MOVEMENTS_PER_PAGE = 25;

const MOVEMENT_INCLUDE = {
  item: { select: { id: true, code: true, name: true } },
  fromLocation: true,
  toLocation: true,
} satisfies Prisma.ItemMovementInclude;

export type MovementWithRelations = Prisma.ItemMovementGetPayload<{
  include: typeof MOVEMENT_INCLUDE;
}>;

export type MovementListResult = {
  movements: MovementWithRelations[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Tanggal `yyyy-mm-dd` → Date. Ditolak bila tidak "bulat" (mis. `2026-02-31`),
 * supaya salah ketik tidak diam-diam bergeser ke bulan berikutnya.
 */
function parseDay(value: string | undefined, endOfDay = false): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return undefined;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export function buildMovementWhere(
  filters: MovementFilters,
): Prisma.ItemMovementWhereInput {
  const q = filters.q?.trim() ?? "";
  const reason = filters.reason?.trim() ?? "";
  const from = parseDay(filters.from);
  const to = parseDay(filters.to, true);

  return {
    ...(q
      ? {
          item: {
            OR: [{ name: { contains: q } }, { code: { contains: q } }],
          },
        }
      : {}),
    ...(reason
      ? { OR: [{ reason: { contains: reason } }, { notes: { contains: reason } }] }
      : {}),
    ...(filters.status ? { toStatus: filters.status } : {}),
    ...(from || to
      ? { movedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };
}

/** Riwayat pergerakan berpaginasi + filter (sebelumnya hanya "N terakhir"). */
export async function listMovements(
  filters: MovementFilters,
): Promise<MovementListResult> {
  "use cache";
  cacheTag(CACHE_TAGS.movements);
  cacheLife("minutes");

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const where = buildMovementWhere(filters);

  const [movements, total] = await prisma.$transaction([
    prisma.itemMovement.findMany({
      where,
      include: MOVEMENT_INCLUDE,
      orderBy: { movedAt: "desc" },
      skip: (page - 1) * MOVEMENTS_PER_PAGE,
      take: MOVEMENTS_PER_PAGE,
    }),
    prisma.itemMovement.count({ where }),
  ]);

  return {
    movements,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / MOVEMENTS_PER_PAGE)),
  };
}

/** Semua data master sekaligus, dipakai untuk mengisi dropdown di form. */
export async function getMasterData() {
  "use cache";
  cacheTag(CACHE_TAGS.master);
  cacheLife("minutes");

  const [categories, departments, brands, locations, suppliers, branches] =
    await prisma.$transaction([
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
      prisma.location.findMany({ orderBy: { name: "asc" } }),
      prisma.supplier.findMany({ orderBy: { name: "asc" } }),
      prisma.branch.findMany({ orderBy: { name: "asc" } }),
    ]);

  return { categories, departments, brands, locations, suppliers, branches };
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
  // Dashboard menampilkan JUMLAH aset aktif di kartu depan (bukan nilainya).
  // `activeItems` = jumlah jenis barang, `activeQuantity` = total unitnya.
  const activeItems = activeRows.length;
  const activeQuantity = activeRows.reduce((sum, row) => sum + row.quantity, 0);
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
    activeItems,
    activeQuantity,
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

/**
 * Ringkasan satu sesi opname untuk halaman daftar. Angka progress dihitung di
 * sini (bukan di komponen) supaya tabel dan judul memakai sumber yang sama.
 */
export type OpnameSummary = {
  id: string;
  code: string;
  status: "OPEN" | "CLOSED";
  scopeLabel: string;
  startedAt: Date;
  closedAt: Date | null;
  lineCount: number;
  countedCount: number;
  differenceCount: number;
};

export async function listOpnames(): Promise<OpnameSummary[]> {
  "use cache";
  cacheTag(CACHE_TAGS.opnames);
  cacheLife("minutes");

  const rows = await prisma.stockOpname.findMany({
    include: {
      lines: { select: { countedQty: true, expectedQty: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    scopeLabel: row.scopeLabel,
    startedAt: row.startedAt,
    closedAt: row.closedAt,
    lineCount: row.lines.length,
    countedCount: row.lines.filter((line) => line.countedQty !== null).length,
    differenceCount: row.lines.filter(
      (line) => line.countedQty !== null && line.countedQty !== line.expectedQty,
    ).length,
  }));
}

/** Satu sesi opname lengkap dengan baris hitungnya, urut kode barang. */
export async function getOpname(id: string) {
  "use cache";
  cacheTag(CACHE_TAGS.opnames);
  cacheLife("minutes");

  return prisma.stockOpname.findUnique({
    where: { id },
    include: {
      location: true,
      branch: true,
      lines: { orderBy: { itemCode: "asc" } },
    },
  });
}

/** Daftar akun untuk halaman kelola pengguna (admin). */
export async function listUsers() {
  "use cache";
  cacheTag(CACHE_TAGS.users);
  cacheLife("minutes");

  return prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: [{ active: "desc" }, { role: "asc" }, { username: "asc" }],
  });
}

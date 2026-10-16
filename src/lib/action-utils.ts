import { Prisma } from "@/generated/prisma/client";
import {
  AcquisitionSource,
  ItemStatus,
} from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { buildSearchKey } from "./utils";
import type { ItemInput } from "./validations";

/** Bentuk state yang dipakai bersama oleh `useActionState` di form. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const EMPTY_ACTION_STATE: ActionState = { ok: false };

export function formToObject(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value;
  }
  return raw;
}

export function describeError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = error.meta?.target;
      const fields = Array.isArray(target)
        ? target.join(", ")
        : typeof target === "string"
          ? target
          : "";
      return `Nilai sudah dipakai, gunakan yang lain${fields ? ` (${fields})` : ""}.`;
    }
    if (error.code === "P2003") return "Relasi data tidak valid.";
    if (error.code === "P2025") return "Data yang ingin diubah tidak ditemukan.";
  }

  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan yang tidak terduga.";
}

/**
 * Seluruh teks yang masuk ke `searchKey`, dalam urutan kanonik. Dipisahkan dari
 * `buildItemSearchKey()` supaya kunci bisa dihitung ulang dari baris database
 * (bukan hanya dari input form) tanpa menggandakan urutan field di dua tempat.
 */
export type ItemSearchKeyFields = {
  code?: string | null;
  name?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  invoiceNo?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
  disposalReason?: string | null;
  categoryName?: string | null;
  departmentName?: string | null;
  departmentCode?: string | null;
  brandName?: string | null;
  locationName?: string | null;
  locationBranchName?: string | null;
  locationBranchCode?: string | null;
  supplierName?: string | null;
  sourceBranchName?: string | null;
  sourceBranchCode?: string | null;
  ownerBranchName?: string | null;
  ownerBranchCode?: string | null;
};

export function composeItemSearchKey(fields: ItemSearchKeyFields): string {
  return buildSearchKey(
    fields.code,
    fields.name,
    fields.model,
    fields.serialNumber,
    fields.invoiceNo,
    fields.assignedTo,
    fields.notes,
    fields.disposalReason,
    fields.categoryName,
    fields.departmentName,
    fields.departmentCode,
    fields.brandName,
    fields.locationName,
    fields.locationBranchName,
    fields.locationBranchCode,
    fields.supplierName,
    fields.sourceBranchName,
    fields.sourceBranchCode,
    fields.ownerBranchName,
    fields.ownerBranchCode,
  );
}

/**
 * `searchKey` menggabungkan seluruh teks yang bisa dicari, termasuk nama
 * relasi. Ini menggantikan `mode: "insensitive"` yang tidak didukung SQLite
 * sehingga pencarian tetap portabel ke PostgreSQL.
 *
 * Nama cabang (lokasi, pembeli, pemilik) ikut dimasukkan supaya mengetik
 * "bandung" langsung menemukan barangnya, bukan hanya lokasinya.
 */
export async function buildItemSearchKey(data: ItemInput): Promise<string> {
  const [
    category,
    department,
    brand,
    location,
    supplier,
    sourceBranch,
    ownerBranch,
  ] = await Promise.all([
      data.categoryId
        ? prisma.category.findUnique({
            where: { id: data.categoryId },
            select: { name: true },
          })
        : null,
      data.departmentId
        ? prisma.department.findUnique({
            where: { id: data.departmentId },
            select: { name: true, code: true },
          })
        : null,
      data.brandId
        ? prisma.brand.findUnique({
            where: { id: data.brandId },
            select: { name: true },
          })
        : null,
      data.locationId
        ? prisma.location.findUnique({
            where: { id: data.locationId },
            select: {
              name: true,
              branch: { select: { name: true, code: true } },
            },
          })
        : null,
      data.supplierId
        ? prisma.supplier.findUnique({
            where: { id: data.supplierId },
            select: { name: true },
          })
        : null,
      data.sourceBranchId
        ? prisma.branch.findUnique({
            where: { id: data.sourceBranchId },
            select: { name: true, code: true },
          })
        : null,
      data.ownerBranchId
        ? prisma.branch.findUnique({
            where: { id: data.ownerBranchId },
            select: { name: true, code: true },
          })
        : null,
    ]);

  return composeItemSearchKey({
    code: data.code,
    name: data.name,
    model: data.model,
    serialNumber: data.serialNumber,
    invoiceNo: data.invoiceNo,
    assignedTo: data.assignedTo,
    notes: data.notes,
    disposalReason: data.disposalReason,
    categoryName: category?.name,
    departmentName: department?.name,
    departmentCode: department?.code,
    brandName: brand?.name,
    locationName: location?.name,
    locationBranchName: location?.branch?.name,
    locationBranchCode: location?.branch?.code,
    supplierName: supplier?.name,
    sourceBranchName: sourceBranch?.name,
    sourceBranchCode: sourceBranch?.code,
    ownerBranchName: ownerBranch?.name,
    ownerBranchCode: ownerBranch?.code,
  });
}

/** Relasi yang namanya ikut tersimpan di `searchKey`. */
const SEARCH_KEY_RELATION_SELECT = {
  category: { select: { name: true } },
  department: { select: { name: true, code: true } },
  brand: { select: { name: true } },
  location: {
    select: { name: true, branch: { select: { name: true, code: true } } },
  },
  supplier: { select: { name: true } },
  sourceBranch: { select: { name: true, code: true } },
  ownerBranch: { select: { name: true, code: true } },
} as const;

/**
 * Hitung ulang `searchKey` dari kondisi database SAAT INI untuk semua barang
 * yang cocok `where`.
 *
 * `searchKey` menyalin nama kategori/unit/merek/lokasi/cabang/supplier, jadi
 * setiap perubahan nama data master — dan setiap perpindahan barang ke lokasi
 * lain — meninggalkan teks lama di kunci pencarian. Akibatnya `?q=` masih bisa
 * menemukan barang lewat nama yang sudah tidak dipakai, dan gagal menemukannya
 * lewat nama yang baru. Karena itu semua jalur mutasi yang menyentuh relasi
 * tersebut wajib memanggil salah satu fungsi di bawah.
 */
export async function refreshItemSearchKeys(
  where: Prisma.ItemWhereInput,
): Promise<number> {
  const rows = await prisma.item.findMany({ where, select: { id: true } });
  return refreshItemSearchKeysByIds(rows.map((row) => row.id));
}

/** Versi `refreshItemSearchKeys()` untuk daftar id yang sudah dikumpulkan. */
export async function refreshItemSearchKeysByIds(
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const items = await prisma.item.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      code: true,
      name: true,
      model: true,
      serialNumber: true,
      invoiceNo: true,
      assignedTo: true,
      notes: true,
      disposalReason: true,
      ...SEARCH_KEY_RELATION_SELECT,
    },
  });
  if (items.length === 0) return 0;

  await prisma.$transaction(
    items.map((item) =>
      prisma.item.update({
        where: { id: item.id },
        data: {
          searchKey: composeItemSearchKey({
            code: item.code,
            name: item.name,
            model: item.model,
            serialNumber: item.serialNumber,
            invoiceNo: item.invoiceNo,
            assignedTo: item.assignedTo,
            notes: item.notes,
            disposalReason: item.disposalReason,
            categoryName: item.category?.name,
            departmentName: item.department?.name,
            departmentCode: item.department?.code,
            brandName: item.brand?.name,
            locationName: item.location?.name,
            locationBranchName: item.location?.branch?.name,
            locationBranchCode: item.location?.branch?.code,
            supplierName: item.supplier?.name,
            sourceBranchName: item.sourceBranch?.name,
            sourceBranchCode: item.sourceBranch?.code,
            ownerBranchName: item.ownerBranch?.name,
            ownerBranchCode: item.ownerBranch?.code,
          }),
        },
      }),
    ),
  );

  return items.length;
}

export function toItemWriteData(
  data: ItemInput,
  searchKey: string,
  /** Kode final; server yang mengisinya bila form mengosongkan kolom kode. */
  code: string,
) {
  const isDisposed = data.status === ItemStatus.DISPOSED;
  const isSold = data.status === ItemStatus.SOLD;

  return {
    code: code.toUpperCase(),
    assetType: data.assetType ?? null,
    name: data.name,
    model: data.model ?? null,
    quantity: data.quantity,
    unit: data.unit,
    purchaseDate: data.purchaseDate ?? null,
    price: data.price,
    invoiceNo: data.invoiceNo ?? null,
    warrantyUntil: data.warrantyUntil ?? null,
    condition: data.condition,
    status: data.status,
    assignedTo: data.assignedTo ?? null,
    serialNumber: data.serialNumber ?? null,
    photoUrl: data.photoUrl ?? null,
    notes: data.notes ?? null,
    categoryId: data.categoryId ?? null,
    departmentId: data.departmentId ?? null,
    brandId: data.brandId ?? null,
    locationId: data.locationId ?? null,
    supplierId: data.supplierId ?? null,

    acquisitionSource: data.acquisitionSource,
    // Cabang pembeli hanya bermakna bila sumbernya memang cabang.
    sourceBranchId:
      data.acquisitionSource === AcquisitionSource.BRANCH
        ? (data.sourceBranchId ?? null)
        : null,
    ownerBranchId: data.ownerBranchId ?? null,

    // Metadata pelepasan selalu diselaraskan dengan `status`: begitu status
    // bukan DISPOSED/SOLD, jejaknya dibersihkan supaya dashboard tidak
    // menghitung barang yang sebenarnya masih aktif.
    disposedAt: isDisposed ? (data.disposedAt ?? new Date()) : null,
    disposalReason: isDisposed ? (data.disposalReason ?? null) : null,
    soldAt: isSold ? (data.soldAt ?? new Date()) : null,
    soldPrice: isSold ? (data.soldPrice ?? null) : null,

    searchKey,
  };
}


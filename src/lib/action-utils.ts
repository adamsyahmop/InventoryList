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

  return buildSearchKey(
    data.code,
    data.name,
    data.model,
    data.serialNumber,
    data.invoiceNo,
    data.assignedTo,
    data.notes,
    data.disposalReason,
    category?.name,
    department?.name,
    department?.code,
    brand?.name,
    location?.name,
    location?.branch?.name,
    location?.branch?.code,
    supplier?.name,
    sourceBranch?.name,
    sourceBranch?.code,
    ownerBranch?.name,
    ownerBranch?.code,
  );
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


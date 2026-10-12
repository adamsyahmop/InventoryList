"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildItemSearchKey,
  describeError,
  formToObject,
  toItemWriteData,
  type ActionState,
} from "@/lib/action-utils";
import { requireAuth } from "@/lib/auth";
import { buildItemCode, itemCodeSequence } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/queries";
import { itemSchema, movementSchema, toFieldErrors } from "@/lib/validations";

function invalidateItemCaches() {
  updateTag(CACHE_TAGS.items);
  updateTag(CACHE_TAGS.movements);
  updateTag(CACHE_TAGS.dashboard);
}

/**
 * Kode barang berikutnya untuk tahun berjalan, dengan akhiran jenis aset:
 * `INV-2026-0011-LPT`. Nomor bersifat global per tahun (bukan per jenis) dan
 * TIDAK dipakai ulang walau barangnya dihapus, supaya kode yang sudah ditempel
 * di fisik barang tidak menunjuk ke barang lain. Bentrok (mis. dua penyimpanan
 * bersamaan) tetap ditolak kolom `code` yang `@unique`.
 */
async function generateItemCode(assetType?: string | null): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await prisma.item.findMany({
    where: { code: { startsWith: `INV-${year}-` } },
    select: { code: true },
  });

  const next =
    rows.reduce((max, row) => Math.max(max, itemCodeSequence(row.code)), 0) + 1;
  return buildItemCode(year, next, assetType);
}

export async function createItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const parsed = itemSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data yang diisi.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  let createdId = "";

  try {
    // Kode dikosongkan di form → server memilih nomor urut berikutnya.
    const code = data.code ?? (await generateItemCode(data.assetType));
    const searchKey = await buildItemSearchKey(data);

    const created = await prisma.item.create({
      data: { ...toItemWriteData(data, searchKey, code), createdBy: "admin" },
    });
    createdId = created.id;

    // Catat posisi awal sebagai titik nol riwayat pergerakan.
    await prisma.itemMovement.create({
      data: {
        itemId: created.id,
        toLocationId: created.locationId,
        toStatus: created.status,
        quantity: created.quantity,
        reason: "Pencatatan awal",
        movedBy: "admin",
      },
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  redirect(`/items/${createdId}`);
}

export async function updateItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { ok: false, message: "ID barang tidak ditemukan." };
  }

  const parsed = itemSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data yang diisi.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;

  try {
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return { ok: false, message: "Barang tidak ditemukan." };
    }

    const searchKey = await buildItemSearchKey(data);
    const nextLocationId = data.locationId ?? null;
    const locationChanged = existing.locationId !== nextLocationId;
    const statusChanged = existing.status !== data.status;

    await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id },
        // Kode kosong saat menyunting = pertahankan kode yang sudah dipakai.
        data: toItemWriteData(data, searchKey, data.code ?? existing.code),
      });

      // Hanya tulis riwayat kalau lokasi atau status benar-benar berubah,
      // supaya tabel pergerakan tidak penuh oleh suntingan kecil.
      if (locationChanged || statusChanged) {
        await tx.itemMovement.create({
          data: {
            itemId: id,
            fromLocationId: existing.locationId,
            toLocationId: nextLocationId,
            fromStatus: existing.status,
            toStatus: data.status,
            quantity: data.quantity,
            reason: "Perubahan data barang",
            movedBy: "admin",
          },
        });
      }
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  redirect(`/items/${id}`);
}

/** Soft delete: data tetap ada supaya riwayat & audit tidak hilang. */
export async function deleteItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID barang tidak ditemukan." };

  try {
    await prisma.item.update({
      where: { id },
      data: { deletedAt: new Date(), status: "DISPOSED" },
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  return { ok: true, message: "Barang berhasil dihapus." };
}

export async function restoreItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID barang tidak ditemukan." };

  try {
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item || !item.deletedAt) {
      return { ok: false, message: "Barang tidak ditemukan di Sampah." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id },
        data: { deletedAt: null, status: "AVAILABLE" },
      });

      await tx.itemMovement.create({
        data: {
          itemId: id,
          fromLocationId: item.locationId,
          toLocationId: item.locationId,
          fromStatus: item.status,
          toStatus: "AVAILABLE",
          quantity: item.quantity,
          reason: "Pemulihan dari Sampah",
          movedBy: "admin",
        },
      });
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  return { ok: true, message: "Barang berhasil dipulihkan." };
}

/**
 * Catat perpindahan / perubahan status barang, lalu sinkronkan
 * kolom `locationId` & `status` pada barang tersebut.
 */
export async function createMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const parsed = movementSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data pergerakan.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { itemId, toLocationId, toStatus, quantity, movedBy, reason, notes } =
    parsed.data;

  try {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) {
      return { ok: false, message: "Barang tidak ditemukan." };
    }

    const nextLocationId = toLocationId ?? null;
    const nextStatus = toStatus ?? item.status;

    if (nextLocationId === item.locationId && nextStatus === item.status) {
      return {
        ok: false,
        message: "Lokasi dan status tujuan sama dengan kondisi saat ini.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.itemMovement.create({
        data: {
          itemId,
          fromLocationId: item.locationId,
          toLocationId: nextLocationId,
          fromStatus: item.status,
          toStatus: nextStatus,
          quantity,
          reason: reason ?? null,
          notes: notes ?? null,
          movedBy: movedBy ?? "admin",
        },
      });

      await tx.item.update({
        where: { id: itemId },
        data: { locationId: nextLocationId, status: nextStatus },
      });
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  return { ok: true, message: "Pergerakan barang berhasil dicatat." };
}


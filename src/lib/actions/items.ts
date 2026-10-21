"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildItemSearchKey,
  describeError,
  formToObject,
  refreshItemSearchKeysByIds,
  toItemWriteData,
  type ActionState,
} from "@/lib/action-utils";
import { requireWrite } from "@/lib/auth";
import {
  PHOTO_FLASH_PARAM,
  PHOTO_FLASH_VALUE,
  PHOTO_UPLOADED_MESSAGE,
  buildItemCode,
  itemCodeSequence,
} from "@/lib/constants";
import {
  discardPhoto,
  deleteUploadedPhoto,
  savePhotoUpload,
  type SavedPhoto,
} from "@/lib/photos";
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

/**
 * Tentukan `photoUrl` dari isi form barang.
 *
 * Aturannya satu arah supaya tidak ada dua sumber kebenaran: berkas unggahan
 * menang, kalau tidak ada berkas maka centang "hapus foto" mengosongkannya, dan
 * kalau keduanya tidak ada foto lama dipertahankan (menyunting nama barang
 * tidak boleh menghapus fotonya).
 *
 * Berkas hasil unggahan dikembalikan lewat `uploaded` supaya pemanggil bisa
 * membuangnya bila penyimpanan ke database gagal.
 */
async function resolvePhotoField(
  formData: FormData,
  previous: string | null,
): Promise<
  | { ok: true; photoUrl: string | null; uploaded: SavedPhoto | null }
  | { ok: false; message: string }
> {
  const upload = await savePhotoUpload(formData);
  if (!upload.ok) return { ok: false, message: upload.message };

  if (upload.file) {
    return { ok: true, photoUrl: upload.file.url, uploaded: upload.file };
  }
  if (formData.get("removePhoto") !== null) {
    return { ok: true, photoUrl: null, uploaded: null };
  }
  return { ok: true, photoUrl: previous, uploaded: null };
}

export async function createItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireWrite();

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
  // Berkas yang sudah ditulis ke disk tapi belum tentu terpakai (kalau
  // penyimpanan barangnya gagal) — dibuang di blok `catch` di bawah.
  let uploaded: SavedPhoto | null = null;

  try {
    const photo = await resolvePhotoField(formData, null);
    if (!photo.ok) {
      return {
        ok: false,
        message: photo.message,
        fieldErrors: { photoUrl: photo.message },
      };
    }
    uploaded = photo.uploaded;

    // Kode dikosongkan di form → server memilih nomor urut berikutnya.
    const code = data.code ?? (await generateItemCode(data.assetType));
    const searchKey = await buildItemSearchKey(data);

    const created = await prisma.item.create({
      data: {
        ...toItemWriteData(data, searchKey, code),
        // Nilai dari `toItemWriteData()` ditimpa: URL foto hanya boleh datang
        // dari unggahan (nama berkasnya dibuat server), bukan dari form.
        photoUrl: photo.photoUrl,
        createdBy: actor.username,
      },
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
        movedBy: actor.username,
      },
    });
  } catch (error) {
    await discardPhoto(uploaded);
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  // Form ini mengalihkan ke halaman detail, dan pengalihan tidak bisa membawa
  // state: keterangan "foto berhasil diunggah" hanya dititipkan bila memang ada
  // berkas baru, lalu dibaca halaman detail untuk ditampilkan di kartu foto.
  redirect(
    uploaded
      ? `/items/${createdId}?${PHOTO_FLASH_PARAM}=${PHOTO_FLASH_VALUE}`
      : `/items/${createdId}`,
  );
}

export async function updateItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireWrite();

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
  let uploaded: SavedPhoto | null = null;

  try {
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return { ok: false, message: "Barang tidak ditemukan." };
    }

    const photo = await resolvePhotoField(formData, existing.photoUrl);
    if (!photo.ok) {
      return {
        ok: false,
        message: photo.message,
        fieldErrors: { photoUrl: photo.message },
      };
    }
    uploaded = photo.uploaded;

    const searchKey = await buildItemSearchKey(data);
    const nextLocationId = data.locationId ?? null;
    const locationChanged = existing.locationId !== nextLocationId;
    const statusChanged = existing.status !== data.status;

    await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id },
        // Kode kosong saat menyunting = pertahankan kode yang sudah dipakai.
        data: {
          ...toItemWriteData(data, searchKey, data.code ?? existing.code),
          // Form tidak lagi punya kolom `photoUrl` yang bisa diketik bebas, jadi
          // nilainya hanya datang dari unggahan, centang hapus, atau foto lama.
          photoUrl: photo.photoUrl,
        },
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
            movedBy: actor.username,
          },
        });
      }
    });

    // Berkas foto lama baru dibuang SETELAH database berhasil: kalau penyimpanan
    // gagal, foto yang masih dipakai tidak ikut hilang dari disk.
    if (existing.photoUrl !== photo.photoUrl) {
      await deleteUploadedPhoto(existing.photoUrl);
    }
  } catch (error) {
    await discardPhoto(uploaded);
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  // Sama seperti form tambah: tanpa berkas baru tidak ada klaim unggahan.
  redirect(
    uploaded
      ? `/items/${id}?${PHOTO_FLASH_PARAM}=${PHOTO_FLASH_VALUE}`
      : `/items/${id}`,
  );
}

/**
 * Unggah / ganti foto langsung dari halaman detail.
 *
 * Dipisah dari `updateItemAction` supaya foto bisa ditambahkan tanpa membuka
 * (dan menyimpan ulang) seluruh data barang — jalur ini hanya menyentuh kolom
 * `photoUrl`, jadi tidak ada risiko data lain ikut tertimpa.
 */
export async function uploadItemPhotoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireWrite();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID barang tidak ditemukan." };

  const upload = await savePhotoUpload(formData);
  if (!upload.ok) {
    return {
      ok: false,
      message: upload.message,
      fieldErrors: { photoUrl: upload.message },
    };
  }
  if (!upload.file) {
    return { ok: false, message: "Pilih berkas foto terlebih dahulu." };
  }

  const existing = await prisma.item.findUnique({
    where: { id },
    select: { photoUrl: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    await discardPhoto(upload.file);
    return { ok: false, message: "Barang tidak ditemukan." };
  }

  try {
    await prisma.item.update({
      where: { id },
      data: { photoUrl: upload.file.url },
    });
  } catch (error) {
    await discardPhoto(upload.file);
    return { ok: false, message: describeError(error) };
  }

  await deleteUploadedPhoto(existing.photoUrl);
  invalidateItemCaches();
  return { ok: true, message: PHOTO_UPLOADED_MESSAGE };
}

/** Hapus foto barang beserta berkasnya. Tanpa foto = sudah sesuai tujuan. */
export async function removeItemPhotoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireWrite();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID barang tidak ditemukan." };

  const existing = await prisma.item.findUnique({
    where: { id },
    select: { photoUrl: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    return { ok: false, message: "Barang tidak ditemukan." };
  }
  if (!existing.photoUrl) {
    return { ok: true, message: "Barang ini belum punya foto." };
  }

  try {
    await prisma.item.update({ where: { id }, data: { photoUrl: null } });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  await deleteUploadedPhoto(existing.photoUrl);
  invalidateItemCaches();
  return { ok: true, message: "Foto barang dihapus." };
}

/** Soft delete: data tetap ada supaya riwayat & audit tidak hilang. */
export async function deleteItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireWrite();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID barang tidak ditemukan." };

  try {
    // Dibaca di dalam transaksi supaya pengiriman ulang tidak menambah audit.
    const outcome = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item) return "missing" as const;
      if (item.deletedAt) return "already" as const;

      // Perubahan barang dan jejak audit harus berhasil bersama.
      await tx.item.update({
        where: { id },
        data: { deletedAt: new Date(), status: "DISPOSED" },
      });

      // Tanpa catatan ini, barang bisa hilang dari daftar aktif tanpa jejak di
      // tabel Pergerakan — padahal menghapus lewat form edit justru mencatatnya.
      await tx.itemMovement.create({
        data: {
          itemId: id,
          fromLocationId: item.locationId,
          toLocationId: item.locationId,
          fromStatus: item.status,
          toStatus: "DISPOSED",
          quantity: item.quantity,
          reason: "Dihapus ke Sampah",
          movedBy: actor.username,
        },
      });

      return "deleted" as const;
    });

    if (outcome === "missing") {
      return { ok: false, message: "Barang tidak ditemukan." };
    }
    // Sudah di Sampah: tidak ada yang berubah, jadi cache tidak perlu dibuang.
    if (outcome === "already") {
      return { ok: true, message: "Barang sudah ada di Sampah." };
    }
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
  const actor = await requireWrite();

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
          movedBy: actor.username,
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
  const actor = await requireWrite();

  const parsed = movementSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data pergerakan.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { itemId, toLocationId, toStatus, quantity, reason, notes } =
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
          movedBy: actor.username,
        },
      });

      await tx.item.update({
        where: { id: itemId },
        data: { locationId: nextLocationId, status: nextStatus },
      });
    });

    // Nama lokasi (beserta cabang lokasinya) tersimpan di `searchKey`, jadi
    // pindah lokasi wajib menyegarkan kunci. Tanpa ini barang masih ditemukan
    // lewat nama lokasi lama dan tidak ditemukan lewat nama lokasi baru.
    if (nextLocationId !== item.locationId) {
      await refreshItemSearchKeysByIds([itemId]);
    }
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateItemCaches();
  return { ok: true, message: "Pergerakan barang berhasil dicatat." };
}


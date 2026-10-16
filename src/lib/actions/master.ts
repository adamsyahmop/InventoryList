"use server";

import { updateTag } from "next/cache";
import {
  describeError,
  formToObject,
  refreshItemSearchKeys,
  type ActionState,
} from "@/lib/action-utils";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/queries";
import {
  branchSchema,
  brandSchema,
  categorySchema,
  departmentSchema,
  locationSchema,
  supplierSchema,
  toFieldErrors,
} from "@/lib/validations";

/**
 * Perubahan data master ikut memengaruhi `searchKey` pada barang (nama
 * kategori/merek/lokasi tersimpan di sana), jadi cache barang juga dibuang.
 * Cache saja tidak cukup: kuncinya juga harus DIHITUNG ULANG lewat
 * `refreshItemSearchKeys()` di action yang bersangkutan, karena kalau tidak
 * teks lama tetap tersimpan di database (bukan cuma di cache).
 * Tabel pergerakan menampilkan NAMA lokasi (`fromLocation`/`toLocation`), jadi
 * cache `movements` juga harus dibuang — kalau tidak, mengganti nama lokasi
 * meninggalkan nama lama di riwayat sampai `cacheLife("minutes")` habis.
 */
function invalidateMasterCaches() {
  updateTag(CACHE_TAGS.master);
  updateTag(CACHE_TAGS.movements);
  updateTag(CACHE_TAGS.items);
  updateTag(CACHE_TAGS.dashboard);
}

/**
 * Jumlah pemakaian sebuah baris data master. Dipakai untuk MENOLAK
 * penghapusan selama barisnya masih dirujuk.
 *
 * Semua relasi master memakai `onDelete: SetNull` (`schema.prisma`), jadi
 * `prisma.*.delete` tidak pernah error — referensinya berubah menjadi `null`
 * diam-diam: barang kehilangan kategori/lokasi/unit, riwayat pergerakan
 * kehilangan nama lokasi, dan teks nama lama tetap tertinggal di `searchKey`
 * barang sehingga `?q=` menemukan barang lewat data yang sudah lenyap.
 * Karena itu penghapusan hanya boleh jalan setelah pemakainya benar-benar
 * kosong — pengguna diberi tahu jumlahnya, bukan dibiarkan menebak.
 */
type MasterUsage = {
  items?: number;
  locations?: number;
  movements?: number;
};

/**
 * Pesan penolakan hapus, atau `null` bila baris master tidak dipakai siapa pun.
 * `subject` ditulis sebagai subjek kalimat (mis. "Kategori ini").
 */
function describeMasterUsage(subject: string, usage: MasterUsage): string | null {
  const parts: string[] = [];
  if (usage.items) parts.push(`${usage.items} barang`);
  if (usage.locations) parts.push(`${usage.locations} lokasi`);
  if (usage.movements) parts.push(`${usage.movements} pergerakan`);
  if (parts.length === 0) return null;

  const advice = usage.movements
    ? "Riwayat pergerakan tidak boleh kehilangan lokasi."
    : "Pindahkan atau ganti referensinya dulu sebelum menghapus.";

  return `${subject} masih dipakai oleh ${parts.join(", ")}. ${advice}`;
}

export async function saveBranchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const parsed = branchSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data cabang.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const payload = {
    name: data.name,
    code: data.code.toUpperCase(),
    notes: data.notes ?? null,
  };

  try {
    if (id) {
      const previous = await prisma.branch.findUniqueOrThrow({ where: { id } });
      await prisma.branch.update({ where: { id }, data: payload });
      if (previous.name !== payload.name || previous.code !== payload.code) {
        await refreshItemSearchKeys({
          OR: [
            { sourceBranchId: id },
            { ownerBranchId: id },
            { location: { is: { branchId: id } } },
          ],
        });
      }
    } else {
      await prisma.branch.create({ data: payload });
    }
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: id ? "Cabang diperbarui." : "Cabang ditambahkan." };
}

export async function deleteBranchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID cabang tidak ditemukan." };

  try {
    // Hitung & hapus di dalam satu transaksi supaya tidak ada celah antara
    // "masih kosong" dan "benar-benar dihapus".
    const blocked = await prisma.$transaction(async (tx) => {
      const [items, locations] = await Promise.all([
        // Barang yang menunjuk cabang ini langsung, ATAU lewat lokasi milik
        // cabang ini (nama cabang lokasi ikut tersimpan di `searchKey`).
        tx.item.count({
          where: {
            OR: [
              { sourceBranchId: id },
              { ownerBranchId: id },
              { location: { is: { branchId: id } } },
            ],
          },
        }),
        tx.location.count({ where: { branchId: id } }),
      ]);

      const message = describeMasterUsage("Cabang ini", { items, locations });
      if (message) return message;

      await tx.branch.delete({ where: { id } });
      return null;
    });

    if (blocked) return { ok: false, message: blocked };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: "Cabang dihapus." };
}

export async function saveDepartmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const parsed = departmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data unit pengelola.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const payload = {
    name: data.name,
    code: data.code.toUpperCase(),
    notes: data.notes ?? null,
  };

  try {
    if (id) {
      const previous = await prisma.department.findUniqueOrThrow({ where: { id } });
      await prisma.department.update({ where: { id }, data: payload });
      if (previous.name !== payload.name || previous.code !== payload.code) {
        await refreshItemSearchKeys({ departmentId: id });
      }
    } else {
      await prisma.department.create({ data: payload });
    }
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return {
    ok: true,
    message: id ? "Unit pengelola diperbarui." : "Unit pengelola ditambahkan.",
  };
}

export async function deleteDepartmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID unit pengelola tidak ditemukan." };

  try {
    const blocked = await prisma.$transaction(async (tx) => {
      const items = await tx.item.count({ where: { departmentId: id } });
      const message = describeMasterUsage("Unit pengelola ini", { items });
      if (message) return message;

      await tx.department.delete({ where: { id } });
      return null;
    });

    if (blocked) return { ok: false, message: blocked };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: "Unit pengelola dihapus." };
}

export async function saveCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const parsed = categorySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data kategori.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const payload = {
    name: data.name,
    code: data.code ?? null,
    description: data.description ?? null,
  };

  try {
    if (id) {
      const previous = await prisma.category.findUniqueOrThrow({ where: { id } });
      await prisma.category.update({ where: { id }, data: payload });
      if (previous.name !== payload.name) {
        await refreshItemSearchKeys({ categoryId: id });
      }
    } else {
      await prisma.category.create({ data: payload });
    }
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: id ? "Kategori diperbarui." : "Kategori ditambahkan." };
}

export async function deleteCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID kategori tidak ditemukan." };

  try {
    const blocked = await prisma.$transaction(async (tx) => {
      const items = await tx.item.count({ where: { categoryId: id } });
      const message = describeMasterUsage("Kategori ini", { items });
      if (message) return message;

      await tx.category.delete({ where: { id } });
      return null;
    });

    if (blocked) return { ok: false, message: blocked };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: "Kategori dihapus." };
}

export async function saveBrandAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const parsed = brandSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data merek.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const payload = { name: data.name, notes: data.notes ?? null };

  try {
    if (id) {
      const previous = await prisma.brand.findUniqueOrThrow({ where: { id } });
      await prisma.brand.update({ where: { id }, data: payload });
      if (previous.name !== payload.name) {
        await refreshItemSearchKeys({ brandId: id });
      }
    } else {
      await prisma.brand.create({ data: payload });
    }
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: id ? "Merek diperbarui." : "Merek ditambahkan." };
}

export async function deleteBrandAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID merek tidak ditemukan." };

  try {
    const blocked = await prisma.$transaction(async (tx) => {
      const items = await tx.item.count({ where: { brandId: id } });
      const message = describeMasterUsage("Merek ini", { items });
      if (message) return message;

      await tx.brand.delete({ where: { id } });
      return null;
    });

    if (blocked) return { ok: false, message: blocked };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: "Merek dihapus." };
}

export async function saveLocationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const parsed = locationSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data lokasi.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const payload = {
    name: data.name,
    building: data.building ?? null,
    floor: data.floor ?? null,
    room: data.room ?? null,
    branchId: data.branchId ?? null,
    notes: data.notes ?? null,
  };

  try {
    if (id) {
      const previous = await prisma.location.findUniqueOrThrow({ where: { id } });
      await prisma.location.update({ where: { id }, data: payload });
      // Cabang lokasi juga tersimpan di `searchKey` barang, jadi ganti cabang
      // (tanpa mengganti nama lokasi) pun tetap perlu hitung ulang.
      if (previous.name !== payload.name || previous.branchId !== payload.branchId) {
        await refreshItemSearchKeys({ locationId: id });
      }
    } else {
      await prisma.location.create({ data: payload });
    }
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: id ? "Lokasi diperbarui." : "Lokasi ditambahkan." };
}

export async function deleteLocationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID lokasi tidak ditemukan." };

  try {
    const blocked = await prisma.$transaction(async (tx) => {
      const [items, movements] = await Promise.all([
        tx.item.count({ where: { locationId: id } }),
        // Riwayat pergerakan menyimpan nama lokasi; menghapus lokasi membuat
        // `fromLocationId`/`toLocationId` menjadi `null` dan jejak audit
        // kehilangan tempat asal/tujuan barang.
        tx.itemMovement.count({
          where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
        }),
      ]);

      const message = describeMasterUsage("Lokasi ini", { items, movements });
      if (message) return message;

      await tx.location.delete({ where: { id } });
      return null;
    });

    if (blocked) return { ok: false, message: blocked };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: "Lokasi dihapus." };
}

export async function saveSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const parsed = supplierSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data supplier.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const payload = {
    name: data.name,
    contact: data.contact ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    notes: data.notes ?? null,
  };

  try {
    if (id) {
      const previous = await prisma.supplier.findUniqueOrThrow({ where: { id } });
      await prisma.supplier.update({ where: { id }, data: payload });
      if (previous.name !== payload.name) {
        await refreshItemSearchKeys({ supplierId: id });
      }
    } else {
      await prisma.supplier.create({ data: payload });
    }
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: id ? "Supplier diperbarui." : "Supplier ditambahkan." };
}

export async function deleteSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "ID supplier tidak ditemukan." };

  try {
    const blocked = await prisma.$transaction(async (tx) => {
      const items = await tx.item.count({ where: { supplierId: id } });
      const message = describeMasterUsage("Supplier ini", { items });
      if (message) return message;

      await tx.supplier.delete({ where: { id } });
      return null;
    });

    if (blocked) return { ok: false, message: blocked };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: "Supplier dihapus." };
}


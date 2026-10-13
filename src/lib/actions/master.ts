"use server";

import { updateTag } from "next/cache";
import { describeError, formToObject, type ActionState } from "@/lib/action-utils";
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
 */
function invalidateMasterCaches() {
  updateTag(CACHE_TAGS.master);
  updateTag(CACHE_TAGS.items);
  updateTag(CACHE_TAGS.dashboard);
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
      await prisma.branch.update({ where: { id }, data: payload });
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
    await prisma.branch.delete({ where: { id } });
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
      await prisma.department.update({ where: { id }, data: payload });
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
    await prisma.department.delete({ where: { id } });
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
      await prisma.category.update({ where: { id }, data: payload });
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
    await prisma.category.delete({ where: { id } });
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
      await prisma.brand.update({ where: { id }, data: payload });
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
    await prisma.brand.delete({ where: { id } });
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
      await prisma.location.update({ where: { id }, data: payload });
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
    await prisma.location.delete({ where: { id } });
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
      await prisma.supplier.update({ where: { id }, data: payload });
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
    await prisma.supplier.delete({ where: { id } });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateMasterCaches();
  return { ok: true, message: "Supplier dihapus." };
}


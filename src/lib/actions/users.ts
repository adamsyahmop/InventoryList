"use server";

import { updateTag } from "next/cache";
import { describeError, formToObject, type ActionState } from "@/lib/action-utils";
import { requireAdmin } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/queries";
import {
  passwordResetSchema,
  toFieldErrors,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validations";

/**
 * Kelola akun pengguna. Semua action di sini **admin-only**.
 *
 * Dua penjagaan yang mudah terlupa dan sengaja ditulis di sini:
 *
 * 1. Admin terakhir tidak boleh dinonaktifkan atau diturunkan perannya — kalau
 *    boleh, tidak ada lagi yang bisa membuka halaman ini dan aplikasi harus
 *    diselamatkan lewat database.
 * 2. Akun tidak boleh menghapus/menonaktifkan dirinya sendiri lewat jalur ini;
 *    admin lain (atau akun itu sendiri setelah dibuat ulang) yang melakukan.
 */

function invalidateUserCaches() {
  updateTag(CACHE_TAGS.users);
}

async function countActiveAdmins(excludeId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      active: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = userCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data akun.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { username: parsed.data.username },
      select: { id: true },
    });
    if (existing) {
      return {
        ok: false,
        message: `Username "${parsed.data.username}" sudah dipakai.`,
        fieldErrors: { username: "Username sudah dipakai" },
      };
    }

    await prisma.user.create({
      data: {
        username: parsed.data.username,
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash: hashPassword(parsed.data.password),
      },
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateUserCaches();
  return { ok: true, message: `Akun "${parsed.data.username}" dibuat.` };
}

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = userUpdateSchema.safeParse({
    ...formToObject(formData),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data akun.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { id, name, role, active } = parsed.data;

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, role: true, active: true },
    });
    if (!target) return { ok: false, message: "Akun tidak ditemukan." };

    if (target.id === actor.id && !active) {
      return { ok: false, message: "Tidak bisa menonaktifkan akun sendiri." };
    }

    // Turunkan peran atau nonaktifkan admin terakhir = aplikasi terkunci.
    const losingAdmin =
      target.role === "ADMIN" &&
      (role !== "ADMIN" || !active) &&
      (await countActiveAdmins(target.id)) === 0;
    if (losingAdmin) {
      return {
        ok: false,
        message: "Ini admin aktif terakhir; tidak bisa diturunkan atau dinonaktifkan.",
      };
    }

    await prisma.user.update({ where: { id }, data: { name, role, active } });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateUserCaches();
  return { ok: true, message: "Akun diperbarui." };
}

export async function resetUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = passwordResetSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`,
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { passwordHash: hashPassword(parsed.data.password) },
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  // Sesi lama tidak diputus paksa di sini (token tidak menyimpan versi password);
  // akun yang passwordnya diganti tetap bisa memakai sesi berjalan sampai
  // kedaluwarsa, atau langsung diputus bila akunnya dinonaktifkan.
  return { ok: true, message: "Password diganti. Sesi lama tetap berlaku sampai kedaluwarsa." };
}

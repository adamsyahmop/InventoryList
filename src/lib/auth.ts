import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionRole,
} from "./session";

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: SessionRole;
};

export const ROLE_LABELS: Record<SessionRole, string> = {
  ADMIN: "Admin",
  STAFF: "Staff",
  VIEWER: "Viewer",
};

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
} as const;

/**
 * Mulai sesi untuk satu akun. Cookie hanya membawa identitas + tanda tangan;
 * status aktif dan peran terbaru selalu dibaca ulang dari database
 * (`getSession`), jadi menonaktifkan akun langsung memutus akses tanpa perlu
 * menunggu cookie kedaluwarsa.
 */
export async function startSession(user: {
  id: string;
  username: string;
  role: SessionRole;
}): Promise<void> {
  const token = await createSessionToken(user);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Pengguna yang sedang login, atau `null`.
 *
 * Dua lapis: tanda tangan cookie (murah, juga dipakai proxy di edge) dan
 * keberadaan akun di database (akun dihapus/nonaktif → sesi dianggap berakhir).
 * Dibungkus `cache()` supaya satu request yang memanggilnya berkali-kali hanya
 * satu query.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const payload = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.u },
    select: USER_SELECT,
  });

  if (!user || !user.active) return null;

  return { id: user.id, username: user.username, name: user.name, role: user.role };
});

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

/**
 * Pertahanan berlapis untuk Server Action. Proxy sudah memblokir request yang
 * tidak punya sesi, tapi Server Action bisa dipanggil langsung lewat POST, jadi
 * identitas diverifikasi ulang di sini.
 *
 * Mengembalikan pengguna yang login supaya pemanggil bisa memakai
 * `actor.username` sebagai jejak audit — bukan string "admin" yang dikarang.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new Error("Sesi tidak valid. Silakan login ulang.");
  }
  return user;
}

/**
 * Untuk action yang MENGUBAH data. Viewer hanya boleh membaca (termasuk ekspor
 * dan cetak label), jadi seluruh jalur tulis memakai guard ini.
 */
export async function requireWrite(): Promise<SessionUser> {
  const user = await requireAuth();
  // `redirect` (bukan throw) supaya penolakan berakhir sebagai pesan yang bisa
  // dibaca di dashboard, bukan layar "Application error".
  if (user.role === "VIEWER") redirect("/?denied=write");
  return user;
}

/** Untuk action yang hanya boleh dilakukan admin (kelola akun, hapus master). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== "ADMIN") redirect("/?denied=admin");
  return user;
}

export { verifyPasswordHash } from "./passwords";

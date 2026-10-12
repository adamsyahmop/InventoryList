import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
  verifySessionToken,
} from "./session";

export async function startSession(): Promise<void> {
  const token = await createSessionToken();
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

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Pertahanan berlapis untuk Server Action. Proxy sudah memblokir request
 * yang tidak punya sesi, tapi Server Action bisa dipanggil langsung lewat
 * POST, jadi kita verifikasi ulang di sini.
 */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("Sesi tidak valid. Silakan login ulang.");
  }
}

export { verifyPassword };

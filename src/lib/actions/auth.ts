"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formToObject, type ActionState } from "@/lib/action-utils";
import { endSession, startSession } from "@/lib/auth";
import {
  clearLoginThrottle,
  formatRetryAfter,
  loginThrottleKey,
  MAX_LOGIN_FAILURES,
  peekLoginThrottle,
  recordLoginFailure,
} from "@/lib/login-throttle";
import { verifyPasswordHash } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { loginSchema, toFieldErrors } from "@/lib/validations";

/** Cegah open redirect: hanya izinkan path internal. */
function safeRedirectTarget(value: unknown): string {
  const target = String(value ?? "").trim();
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  return "/";
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Username dan password wajib diisi.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const throttleKey = loginThrottleKey(await headers());

  // Sudah terkunci: tolak sebelum memeriksa password, supaya tebakan tidak
  // bisa "menyelip" tepat saat password kebetulan benar.
  const current = peekLoginThrottle(throttleKey);
  if (current.blocked) {
    return {
      ok: false,
      message: `Terlalu banyak percobaan login. Coba lagi dalam ${formatRetryAfter(current.retryAfterSeconds)}.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
    select: {
      id: true,
      username: true,
      role: true,
      active: true,
      passwordHash: true,
    },
  });

  // Akun nonaktif diperlakukan sama seperti password salah (tidak membocorkan
  // bahwa username-nya ada), tapi tetap dihitung sebagai kegagalan.
  const valid =
    user !== null &&
    user.active &&
    verifyPasswordHash(parsed.data.password, user.passwordHash);

  if (!valid) {
    const after = recordLoginFailure(throttleKey);

    if (after.blocked) {
      return {
        ok: false,
        message: `Terlalu banyak percobaan login. Login dikunci ${formatRetryAfter(after.retryAfterSeconds)} untuk alamat ini.`,
      };
    }

    const sisa = after.remaining;
    return {
      ok: false,
      message:
        sisa < MAX_LOGIN_FAILURES
          ? `Username atau password salah. Sisa ${sisa} percobaan sebelum login dikunci.`
          : "Username atau password salah. Coba lagi.",
    };
  }

  clearLoginThrottle(throttleKey);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await startSession({ id: user.id, username: user.username, role: user.role });
  redirect(safeRedirectTarget(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

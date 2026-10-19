"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formToObject, type ActionState } from "@/lib/action-utils";
import { endSession, startSession, verifyPassword } from "@/lib/auth";
import {
  clearLoginThrottle,
  formatRetryAfter,
  loginThrottleKey,
  MAX_LOGIN_FAILURES,
  peekLoginThrottle,
  recordLoginFailure,
} from "@/lib/login-throttle";
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
      message: "Password wajib diisi.",
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

  if (!verifyPassword(parsed.data.password)) {
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
          ? `Password salah. Sisa ${sisa} percobaan sebelum login dikunci.`
          : "Password salah. Coba lagi.",
    };
  }

  clearLoginThrottle(throttleKey);
  await startSession();
  redirect(safeRedirectTarget(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

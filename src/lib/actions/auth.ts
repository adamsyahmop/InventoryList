"use server";

import { redirect } from "next/navigation";
import { formToObject, type ActionState } from "@/lib/action-utils";
import { endSession, startSession, verifyPassword } from "@/lib/auth";
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

  if (!verifyPassword(parsed.data.password)) {
    return { ok: false, message: "Password salah. Coba lagi." };
  }

  await startSession();
  redirect(safeRedirectTarget(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/**
 * Sesi berbasis cookie bertanda tangan HMAC-SHA256.
 *
 * Sengaja memakai Web Crypto (`crypto.subtle`) dan bukan `node:crypto`
 * supaya modul yang sama bisa dipakai di Proxy (edge runtime) maupun di
 * Server Actions (node runtime).
 */

export const SESSION_COOKIE = "inventory_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

const encoder = new TextEncoder();

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me";
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Perbandingan waktu-tetap sederhana supaya tidak bocor lewat timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Token berformat `<issuedAt>.<hmac>`. */
export async function createSessionToken(): Promise<string> {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${await hmacHex(issuedAt)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const issued = Number(issuedAt);
  if (!Number.isFinite(issued)) return false;

  const age = Date.now() - issued;
  if (age < 0 || age > SESSION_MAX_AGE_SECONDS * 1000) return false;

  return safeEqual(await hmacHex(issuedAt), signature);
}

/** Bandingkan password yang diketik dengan APP_PASSWORD. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "admin";
  return safeEqual(input, expected);
}

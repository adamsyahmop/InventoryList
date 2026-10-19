/**
 * Sesi berbasis cookie bertanda tangan HMAC-SHA256.
 *
 * Sengaja memakai Web Crypto (`crypto.subtle`) dan bukan `node:crypto`
 * supaya modul yang sama bisa dipakai di Proxy (edge runtime) maupun di
 * Server Actions (node runtime).
 */

export const SESSION_COOKIE = "inventory_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

/**
 * Nilai cadangan yang HANYA boleh dipakai saat `next dev`. Semuanya tertulis di
 * repo, jadi di produksi nilainya setara dengan tidak punya rahasia sama sekali.
 */
const DEV_SESSION_SECRET = "dev-only-insecure-secret-change-me";
const DEV_APP_PASSWORD = "admin";

/** Password yang sudah beredar di repo/dokumentasi — ditolak di produksi. */
const WEAK_APP_PASSWORDS = new Set([
  DEV_APP_PASSWORD,
  "password",
  "password123",
  "123456",
  "12345678",
  "changeme",
  "secret",
  "qwerty",
  "admin123",
]);

export const MIN_SESSION_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function missingEnvMessage(name: string, hint: string): string {
  return (
    `${name} wajib diisi di produksi (${hint}). ` +
    `Aplikasi sengaja berhenti agar tidak memakai nilai cadangan yang ada di repo.`
  );
}

/**
 * Kunci HMAC. Di `next dev` boleh jatuh ke nilai cadangan (praktis untuk
 * pengembangan lokal); di produksi nilai kosong, placeholder repo, atau terlalu
 * pendek membuat fungsi ini **melempar error** alih-alih diam-diam memakai
 * rahasia yang bisa dibaca dari repo.
 */
function getSessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim() ?? "";

  if (!isProduction()) return value || DEV_SESSION_SECRET;

  if (!value) {
    throw new Error(missingEnvMessage("SESSION_SECRET", "mis. hasil `openssl rand -hex 32`"));
  }
  if (value === DEV_SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET masih memakai nilai placeholder yang ada di repo. " +
        "Buat nilai baru: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\".",
    );
  }
  if (value.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET terlalu pendek (${value.length} karakter, minimal ${MIN_SESSION_SECRET_LENGTH}).`,
    );
  }

  return value;
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

/**
 * Password yang diharapkan. Di `next dev` boleh jatuh ke `admin`; di produksi
 * nilai kosong atau password yang sudah tertulis di repo membuat fungsi ini
 * melempar error.
 */
function getAppPassword(): string {
  const value = process.env.APP_PASSWORD ?? "";

  if (!isProduction()) return value || DEV_APP_PASSWORD;

  if (!value) {
    throw new Error(missingEnvMessage("APP_PASSWORD", "password login aplikasi"));
  }
  if (WEAK_APP_PASSWORDS.has(value.trim().toLowerCase())) {
    throw new Error(
      "APP_PASSWORD memakai nilai default yang ada di repo. Ganti dengan password tersendiri di .env.",
    );
  }

  return value;
}

/** Bandingkan password yang diketik dengan APP_PASSWORD. */
export function verifyPassword(input: string): boolean {
  return safeEqual(input, getAppPassword());
}

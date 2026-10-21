/**
 * Sesi berbasis cookie bertanda tangan HMAC-SHA256.
 *
 * Sengaja memakai Web Crypto (`crypto.subtle`) dan bukan `node:crypto` supaya
 * modul yang sama bisa dipakai di Proxy (edge runtime) maupun di Server Actions
 * (node runtime).
 *
 * Sejak multi-user, isi cookie bukan lagi "kapan login" saja, tapi identitas
 * yang ditandatangani:
 *
 *   <base64url({u,n,r,t})>.<hmac-hex>
 *
 * Dengan begitu proxy bisa tahu siapa pemilik cookie tanpa menyentuh database
 * (edge runtime tidak bisa memakai Prisma), sedangkan pemeriksaan yang butuh
 * data hidup (akun masih aktif? perannya berubah?) dilakukan di `src/lib/auth.ts`.
 * Cookie yang dibuat versi lama (`<timestamp>.<hmac>`) otomatis tidak sah lagi,
 * jadi semua pengguna perlu login ulang sekali setelah upgrade ini.
 */

export const SESSION_COOKIE = "inventory_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

export type SessionRole = "ADMIN" | "STAFF" | "VIEWER";

export type SessionPayload = {
  /** id akun (`User.id`) */
  u: string;
  /** username, dipakai untuk ditampilkan & jejak audit */
  n: string;
  /** peran saat login; peran terbaru tetap dibaca dari database */
  r: SessionRole;
  /** waktu terbit (ms) */
  t: number;
};

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

function toBase64Url(text: string): string {
  const bytes = encoder.encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Token untuk satu pengguna: `<payload b64url>.<hmac>`. */
export async function createSessionToken(
  user: { id: string; username: string; role: SessionRole },
): Promise<string> {
  const payload: SessionPayload = {
    u: user.id,
    n: user.username,
    r: user.role,
    t: Date.now(),
  };
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${await hmacHex(body)}`;
}

/**
 * Verifikasi tanda tangan + umur token, lalu kembalikan isinya. `null` berarti
 * cookie tidak sah/kedaluwarsa — BUKAN berarti akunnya masih ada atau aktif
 * (`src/lib/auth.ts` yang memeriksa itu ke database).
 */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  if (!safeEqual(await hmacHex(body), signature)) return null;

  const json = fromBase64Url(body);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const payload = parsed as Partial<SessionPayload>;
  if (
    typeof payload.u !== "string" ||
    typeof payload.n !== "string" ||
    typeof payload.t !== "number" ||
    (payload.r !== "ADMIN" && payload.r !== "STAFF" && payload.r !== "VIEWER")
  ) {
    return null;
  }

  const age = Date.now() - payload.t;
  if (age < 0 || age > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return payload as SessionPayload;
}

/**
 * Password admin awal. Sejak multi-user, ini BUKAN lagi password login: nilainya
 * dipakai `npm run user:create` saat menyiapkan akun pertama (dan tetap divalidasi
 * ketat di produksi supaya instalasi baru tidak memakai password contoh repo).
 */
export function getBootstrapPassword(): string {
  const value = process.env.APP_PASSWORD ?? "";

  if (!isProduction()) return value || DEV_APP_PASSWORD;

  if (!value) {
    throw new Error(missingEnvMessage("APP_PASSWORD", "password admin awal"));
  }
  if (WEAK_APP_PASSWORDS.has(value.trim().toLowerCase())) {
    throw new Error(
      "APP_PASSWORD memakai nilai default yang ada di repo. Ganti dengan password tersendiri di .env.",
    );
  }

  return value;
}

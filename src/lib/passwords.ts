import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash password memakai scrypt bawaan Node.
 *
 * Format tersimpan: `scrypt$<salt hex>$<hash hex>`. Tanpa dependensi tambahan
 * (bcrypt/argon2); formatnya menyebut algoritmanya, jadi hash lama tetap
 * terbaca kalau parameter scrypt dinaikkan nanti.
 *
 * Modul ini TIDAK boleh diimpor dari Edge (proxy): `node:crypto` tidak tersedia
 * di sana. Proxy hanya memverifikasi tanda tangan cookie, bukan password.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [prefix, saltHex, hashHex] = stored.split("$");
  if (prefix !== PREFIX || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  return timingSafeEqual(expected, actual);
}

/** Panjang minimum password akun. */
export const MIN_PASSWORD_LENGTH = 8;

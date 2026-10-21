#!/usr/bin/env tsx
/**
 * Membuat / mengubah akun dari terminal — untuk bootstrap dan pemulihan.
 *
 * Aplikasi tidak punya halaman pendaftaran: akun pertama harus dibuat dari
 * sini (atau lewat halaman /pengguna oleh admin yang sudah ada). Skrip ini
 * idempoten: kalau username sudah ada, password/peran/nama-nya diperbarui dan
 * akunnya diaktifkan kembali.
 *
 * Contoh:
 *   npm run user:create -- --username adam --name "Adam Saputra" --role ADMIN
 *   npm run user:create -- --username budi --name "Budi" --role STAFF --password "Rahasia#123"
 *
 * Tanpa `--password`, nilai diambil dari env `APP_PASSWORD` (kalau ada); kalau
 * tidak ada juga, skrip membuat password acak dan menampilkannya sekali.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/passwords";
import path from "node:path";

type Role = "ADMIN" | "STAFF" | "VIEWER";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const username = (arg("username") ?? "").trim().toLowerCase();
if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  fail("--username wajib (3-32 karakter: huruf kecil, angka, titik, garis).");
}

const remove = process.argv.includes("--delete");
const name = (arg("name") ?? username).trim();
const roleRaw = (arg("role") ?? "ADMIN").trim().toUpperCase();
if (!["ADMIN", "STAFF", "VIEWER"].includes(roleRaw)) {
  fail("--role harus ADMIN, STAFF, atau VIEWER.");
}
const role = roleRaw as Role;

const generated = !arg("password") && !process.env.APP_PASSWORD;
const password =
  arg("password") ??
  process.env.APP_PASSWORD ??
  randomBytes(9).toString("base64url");

if (!remove && password.length < MIN_PASSWORD_LENGTH) {
  fail(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`);
}

const url = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
const absolute = path.isAbsolute(url) ? url : path.resolve(process.cwd(), url);

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${absolute}` }),
  });

  const existing = await prisma.user.findUnique({ where: { username } });

  if (remove) {
    if (!existing) {
      console.log(`tidak ada akun "${username}" (sudah bersih)`);
    } else {
      await prisma.user.delete({ where: { id: existing.id } });
      console.log(`dihapus: ${username}`);
    }
    await prisma.$disconnect();
    return;
  }

  const user = await prisma.user.upsert({
    where: { username },
    update: { name, role, active: true, passwordHash: hashPassword(password) },
    create: { username, name, role, passwordHash: hashPassword(password) },
  });

  console.log(`${existing ? "diperbarui" : "dibuat"}: ${user.username} (${user.role}) — ${user.name}`);
  console.log(`  database: ${absolute}`);
  if (existing) console.log("  password diganti dengan nilai di atas");
  if (generated && existing) console.log("  (password acak dibuat karena tidak ada --password/APP_PASSWORD)");
  if (!existing) console.log(`  password: ${password}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

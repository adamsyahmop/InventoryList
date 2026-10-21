#!/usr/bin/env node
/**
 * Backup database SQLite tanpa menghentikan aplikasi.
 *
 * Memakai `VACUUM INTO`, bukan `copy dev.db`: menyalin berkas SQLite yang sedang
 * ditulis bisa menghasilkan salinan rusak (ada WAL yang belum digabung), sedang
 * `VACUUM INTO` menulis satu berkas utuh yang konsisten dari sisi pembacaan.
 *
 * Pakai:
 *   node scripts/backup-db.mjs                  # ke ./backups
 *   BACKUP_DIR=/srv/backup node scripts/backup-db.mjs
 *   KEEP=30 node scripts/backup-db.mjs          # simpan 30 berkas terakhir
 *
 * Di deployment Docker, jalankan di dalam service migrate (yang punya akses ke
 * volume /data):
 *   docker compose run --rm migrate node scripts/backup-db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const source = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
if (!fs.existsSync(source)) {
  console.error(`Database tidak ditemukan: ${source}`);
  process.exit(1);
}

const backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
const keep = Number(process.env.KEEP ?? 14);
const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
const target = path.join(backupDir, `inventory-${stamp}.db`);

fs.mkdirSync(backupDir, { recursive: true });

const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

// Salinan diverifikasi sebelum dianggap berhasil: integrity_check + jumlah baris.
const copy = new Database(target, { readonly: true });
const integrity = copy.pragma("integrity_check", { simple: true });
const counts = {
  barang: copy.prepare("select count(*) as n from items").get().n,
  pergerakan: copy.prepare("select count(*) as n from item_movements").get().n,
  opname: copy.prepare("select count(*) as n from stock_opnames").get().n,
};
copy.close();

const size = (fs.statSync(target).size / 1024).toFixed(1);
console.log(`backup: ${target}`);
console.log(`  integrity=${integrity} size=${size}KB`);
console.log(
  `  barang=${counts.barang} pergerakan=${counts.pergerakan} opname=${counts.opname}`,
);

if (integrity !== "ok") {
  console.error("Backup TIDAK valid (integrity_check gagal).");
  process.exit(1);
}

// Pangkas backup lama, sisakan `keep` berkas terbaru.
const files = fs
  .readdirSync(backupDir)
  .filter((name) => /^inventory-.*\.db$/.test(name))
  .sort();
for (const name of files.slice(0, Math.max(0, files.length - keep))) {
  fs.unlinkSync(path.join(backupDir, name));
  console.log(`  dihapus (rotasi): ${name}`);
}

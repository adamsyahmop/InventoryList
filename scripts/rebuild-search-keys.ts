import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { refreshItemSearchKeys } from "../src/lib/action-utils";

/**
 * Backfill `searchKey` untuk database yang sudah punya isi dari versi sebelum
 * perbaikan ini: kunci pencarian lama masih menyalin nama data master yang
 * sudah diganti, atau nama lokasi lama barang yang sudah dipindah. Akibatnya
 * `?q=` bisa menemukan barang lewat nama yang tidak dipakai lagi dan gagal
 * menemukannya lewat nama yang baru.
 *
 * Jalankan sekali per database yang sudah terisi:
 *
 *   npm run rebuild-search-keys
 *
 * Aman diulang: kunci selalu dihitung ulang dari relasi yang berlaku sekarang,
 * dan hanya kolom `searchKey` yang ditulis.
 */
async function main() {
  const count = await refreshItemSearchKeys({});
  console.log(`searchKey dihitung ulang untuk ${count} barang.`);
}

main()
  .catch((error) => {
    console.error("Perhitungan ulang searchKey gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
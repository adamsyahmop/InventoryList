# Catatan Lanjutan — Inventory List

Terakhir diperbarui: 20 Oktober 2026 (**Paket 6–13** — Tier A tuntas, Tier B 5/6,
Tier C deploy & backup selesai).
Paket 6: rahasia tanpa fallback hardcoded. Paket 7: **throttle login** per IP.
Paket 8: **impor `.xlsx`**. Paket 9: **ekspor mengikuti filter**. Paket 10:
**`/movements` filter + paginasi**. Paket 11: **label massal**. Paket 12:
**stock opname** (`/opname`, model `StockOpname`/`StockOpnameLine`). Paket 13:
**deploy VPS/Docker** (standalone build + compose + backup/restore). `smoke.ps1`
kini **384 pemeriksaan, 0 gagal**.
Sebelumnya, 16 Oktober 2026: **foto barang** selesai
end-to-end: unggah dari form barang & halaman detail, disajikan lewat route
handler ber-sesi, berkas lama dibersihkan otomatis, dan keterangan **"Foto
barang berhasil diunggah."** muncul di kartu foto maupun setelah form barang
disimpan (penanda `?photo=uploaded`; bagian foto `smoke.ps1` kini memilih sendiri
barang ujinya). Sebelumnya di sesi yang sama:
Tier A #1 & #2 tertutup (`searchKey` dihitung ulang saat data master berubah /
barang pindah lokasi, dan hapus data master kini **ditolak** bila barisnya masih
dipakai); sebelum itu: halaman Sampah & pemulihan barang, kode barang otomatis +
QR & label cetak, fixture seed bermigrasi ke format kode bersuffix).
Stack: Next.js 16.4.0 (Turbopack, Cache Components aktif) + Prisma 7.10.0 + SQLite (`dev.db`).
Repositori: https://github.com/adamsyahmop/InventoryList (branch `main`, commit awal `823b402`).
Identitas git repo ini: `adamsyahmop` / `adamsyahmop@users.noreply.github.com` (noreply, agar email asli tidak terekspos); `.env.example` di-*unignore* lewat `!.env.example` supaya template tetap ikut ter-commit.

## Status: aplikasi JALAN dan TERVERIFIKASI ✅

`npm run build` hijau (14/14 halaman statis + rute dinamis `/api/export` dan
`/api/photos/[name]`), `npm run lint`
hijau, `npx tsc --noEmit` hijau, `npm run seed` hijau, dan smoke test end-to-end
**384 pemeriksaan, 0 gagal** (`exit 0`) — dijalankan terhadap build produksi
(`npm run start -- -p 3100`), bukan server dev. Diverifikasi ulang 16 Oktober
2026 setelah foto barang (Paket 5 #3) dan penolakan hapus data master
(Paket 5 #2); keterangan **"Foto barang berhasil diunggah."** menambah 4
pemeriksaan lagi (289 dari 285), sebelumnya 236 pemeriksaan, dan 205 pemeriksaan
setelah perbaikan `searchKey` (Paket 5 #1).

> Baris uji manual `INV-2026-0011-ELE` (Charger Laptop Lenovo, dibuat 13 Oktober
> 2026 lewat form barang baru) sudah dihapus dari `dev.db` — sebelumnya baris itu
> membuat 4 pemeriksaan angka dashboard gagal. DB kini persis data seed: 9 barang
> aktif + 1 barang ter-soft-delete, dan movement yatim 0 (pergerakan barang itu
> ikut terhapus lewat `onDelete: Cascade`).

## Paket 13 — arah deploy: VPS + Docker (sesi 20 Oktober 2026)

Butir Tier C yang paling mendesak: README masih memuat boilerplate "Deploy on
Vercel", padahal aplikasi ini **tidak mungkin** jalan di sana — SQLite lewat
`better-sqlite3` (modul native) dan foto barang di `uploads/` butuh filesystem
yang persisten, sedangkan platform serverless read-only/ephemeral.

**Keputusan: VPS + Docker, SQLite tetap.** PostgreSQL adalah opsi yang sudah
disiapkan skema (komentar di `prisma/schema.prisma`), tapi migrasi itu pekerjaan
tersendiri dan tidak dibutuhkan untuk satu instans dengan puluhan ribu baris.
Yang dipilih sekarang: bikin artefak produksi yang benar-benar bisa dinaikkan.

Perubahan:

- `next.config.ts` — `output: "standalone"`.
- `Dockerfile` — tiga stage: `deps` (toolchain untuk better-sqlite3 bila prebuilt
  tidak tersedia), `builder` (`prisma generate` + `npm run build`), `runner`
  (hanya standalone + static + public, user `node`, volume `/data` &
  `/app/uploads`).
- `docker-compose.yml` — service `migrate` (image builder, `prisma migrate
  deploy` sekali) dan `app` (`depends_on: service_completed_successfully`), dua
  volume bernama, healthcheck ke `/login`.
- `.dockerignore` — `.env`, database, `uploads`, `backups` tidak ikut ke image.
- `scripts/backup-db.mjs` (`npm run backup`) — `VACUUM INTO` + `integrity_check`
  + jumlah baris + rotasi `KEEP` (default 14).
- `scripts/restore-db.md` — prosedur restore (Docker & non-Docker), termasuk
  catatan bahwa foto **tidak** ikut backup database.
- `src/lib/prisma.ts` — direktori induk database dibuat bila belum ada
  (`fs.mkdirSync`), supaya start pertama dengan volume kosong tidak gagal dengan
  pesan "directory does not exist" yang tidak menyebut path.
- `smoke.ps1` — `$base` bisa diganti lewat `SMOKE_BASE`, jadi gate yang sama bisa
  dipakai memeriksa artefak standalone/Docker (bukan cuma `next start`).
- README — bagian "Menjalankan lokal" + "Deploy" (VPS/Docker, volume, backup,
  upgrade, catatan satu-instance & HTTPS); boilerplate Vercel dibuang.

Verifikasi 20 Oktober 2026 — **Docker tidak terpasang di mesin ini**, jadi image
sendiri belum pernah dibangun. Yang bisa dan sudah diuji adalah artefak di
dalamnya: `.next/standalone` disalin ke folder bersih seperti yang dilakukan
`Dockerfile`, dijalankan dengan `NODE_ENV=production` + `DATABASE_URL` absolut ke
salinan `dev.db` di folder `data/`, lalu **`smoke.ps1` 384 pemeriksaan, 0 gagal**
(`SMOKE_BASE=http://localhost:3101`). Jadi `server.js` standalone, better-sqlite3
native, Prisma client, dan `/api/export` (exceljs) terbukti jalan tanpa
`node_modules` penuh.

Backup diuji nyata: `node scripts/backup-db.mjs` → `integrity=ok`, 252 KB,
`barang=10 pergerakan=91 opname=4`; berkas hasilnya dipakai sebagai database
restore-test, `npx prisma migrate deploy` menjawab **"No pending migrations"**,
dan datanya utuh.

Dua temuan saat verifikasi:

1. **`/api/export` 500 di artefak standalone** pada percobaan pertama. Penyebabnya
   path `DATABASE_URL` bergaya MSYS (`file:/c/Users/...`): `path.isAbsolute()`
   menganggapnya absolut, lalu better-sqlite3 menafsirkannya sebagai path relatif
   di root drive → folder tidak ada. Dengan path `file:C:/...` (atau `/data/...`
   di Linux) export normal. Ditambah `mkdirSync` di `prisma.ts` supaya kasus
   "folder belum ada" tidak muncul sebagai error yang membingungkan.
2. Forged cookie di gate **harus** memakai `SESSION_SECRET` yang sama dengan
   server; saat skrip env percobaan memakai nilai karangan, semua request jadi
   307 ke `/login` dan gejalanya terlihat seperti "auth rusak" padahal bukan.

Belum terverifikasi di sini: `docker build`, `docker compose up`, healthcheck
container, dan `prisma migrate deploy` di dalam image builder (di host sudah
dijalankan dan hijau). Langkah pertama di VPS: `docker compose up -d --build`,
lalu `docker compose ps` (app harus `healthy`).

## Paket 12 — stock opname (sesi 20 Oktober 2026)

Butir kelima Tier B, dan yang paling besar: alur wajib inventaris yang selama ini
tidak ada sama sekali. Sebelumnya stok hanya bisa **diubah** lewat form barang
(`quantity`), tanpa cara membandingkannya dengan hitungan fisik.

Model baru (migrasi `20261020101609_add_stock_opname`):

- `StockOpname` — satu sesi: `code` (`OPN-2026-0001`), `status` (OPEN/CLOSED),
  `scopeLabel` + `locationId`/`branchId`, `startedAt`, `closedAt`, `createdBy`.
- `StockOpnameLine` — satu baris per barang: snapshot `itemCode`/`itemName`/
  `locationName`, `expectedQty` (stok sistem saat sesi dimulai), `countedQty`
  (`null` = belum dihitung), `note`, `countedAt`.

Alur tiga langkah, sengaja bisa ditinggal di tengah:

1. **Mulai** (`startOpnameAction`) — kunci lingkup, lalu salin stok sistem ke
   baris-baris. Lingkup: semua barang aktif, satu cabang, atau satu lokasi
   (memilih cabang **dan** lokasi sekaligus ditolak — lokasi sudah di dalam
   cabang).
2. **Hitung** (`saveOpnameCountsAction`) — simpan per baris, boleh sebagian,
   boleh berkali-kali. Hanya baris milik sesi itu yang disentuh.
3. **Tutup** (`closeOpnameAction`) — satu transaksi: stok barang diubah ke angka
   fisik, satu baris `ItemMovement` ditulis per barang yang selisih (dengan
   `quantity` = selisih, bisa negatif), lalu sesi jadi CLOSED.

Keputusan yang perlu diingat:

- **Snapshot, bukan angka hidup.** `expectedQty` dibekukan saat sesi mulai. Kalau
  ada barang keluar saat orang masih menghitung, pembandingnya tetap angka awal —
  kalau tidak, "selisih" bisa muncul hanya karena stok bergerak di tengah sesi.
- **Belum dihitung ≠ nol.** Baris kosong (`countedQty = null`) tidak dianggap 0
  dan tidak diubah saat penutupan; yang dihitung nol justru temuan penting, jadi
  input dibiarkan kosong dan hanya `0` yang diketik yang berarti nol.
- **Penutupan menolak sesi tanpa satu pun hitungan.** Menutup sesi kosong akan
  "menghapus" stok hanya karena tombol tertekan lebih awal.
- **Sesi tertutup tidak bisa diubah.** Jejak opname yang sudah final tidak
  bergeser; koreksi berikutnya adalah sesi baru.
- **Barang yang dihapus (soft delete) tetap tercatat di baris opname**, tapi
  stoknya tidak disentuh lagi saat penutupan.
- **Lingkup di luar "semua barang" memakai `buildItemWhere`** — rumus filter yang
  sama dengan `/items` dan ekspor, jadi definisi "barang di lokasi X" tidak
  ditulis ulang.

Verifikasi 20 Oktober 2026: `npx prisma generate` (client baru), `npx tsc
--noEmit` hijau, `npx eslint` hijau, `npm run build` hijau, **`smoke.ps1` 384
pemeriksaan, 0 gagal** (`exit 0`). 24 pemeriksaan baru menjalankan alur penuh
lewat HTTP: sesi tanpa hitungan ditolak, jumlah `abc` ditolak, simpan 9 baris,
progress `9/9`, tutup → `1 barang disesuaikan`, halaman jadi arsip (form hitung
hilang), dan `/movements` memuat `Stock opname OPN-…`. Sesi kedua mengembalikan
stok ke angka semula sehingga gate bisa dijalankan berulang; dibuktikan langsung
ke `dev.db`: dua sesi CLOSED berisi 9 baris, selisih `+1` lalu `-1`, dua baris
pergerakan dengan catatan `Stok sistem 3 → fisik 4` dan sebaliknya, dan
`quantity` seluruh barang **identik** dengan sebelum uji.

Belum tercakup: lembar hitung belum punya pencarian/filter (daftar panjang harus
digulir; untuk ratusan barang perlu kotak cari atau memindai QR yang sudah ada di
label), belum ada opname per kategori/unit, dan belum ada ekspor hasil opname.

## Paket 11 — label massal (sesi 19 Oktober 2026)

Butir keempat Tier B. Sampai sekarang label hanya bisa dicetak satu per satu dari
`/items/[id]/label` — untuk 40 barang baru berarti 40 kali buka halaman. Yang
ditambahkan: **`/items/labels`**, satu halaman berisi label untuk barang hasil
filter.

Perubahan:

- `src/app/(app)/items/labels/page.tsx` (baru) — menerima query string yang sama
  dengan `/items`, membaca filter lewat `parseItemFilters()` (parser yang juga
  dipakai `/api/export`, jadi tidak ada aturan filter kedua), lalu merender grid
  label: QR + kode + nama + lokasi. Aturan cetak `@page A4` + `break-inside-avoid`
  supaya satu label tidak terbelah antarlembar.
- `src/components/items/items-toolbar.tsx` — tombol **Cetak label** di samping
  ekspor, membawa `toExportQuery(values)` yang sedang aktif.

Keputusan:

- **Isi label massal lebih ringkas daripada label satuan.** Kode, nama, lokasi.
  Status & kondisi sengaja tidak dicetak: dua field itu paling sering berubah,
  jadi label fisik akan cepat berbohong; kode dan nama justru yang dipakai untuk
  mencocokkan barang.
- **Filter bukan pilihan lewat checkbox, tapi lewat URL.** Pengguna menyaring di
  `/items` seperti biasa lalu menekan Cetak label — satu jalur logika, dan hasil
  cetak tidak mungkin berbeda dari yang terlihat.
- **Batas `LABELS_MAX` (default 200, bisa lewat env).** Satu QR ≈ 1,5 KB SVG;
  filter tanpa saringan pada data besar akan menghasilkan halaman beberapa MB.
  Kalau terpotong, halaman menyebut "dibatasi dari N barang" alih-alih diam-diam
  mencetak sebagian.

Verifikasi 19 Oktober 2026: `npx tsc --noEmit` hijau, `npx eslint` hijau,
`npm run build` hijau (`/items/labels` terdeteksi dinamis), **`smoke.ps1` 360
pemeriksaan, 0 gagal** (`exit 0`). 13 pemeriksaan baru: toolbar `/items`
menautkan `/items/labels`; halaman penuh memuat "label siap dicetak", `<svg`,
`print-area`, kode barang pertama & terakhir; `?q=INV-2026-0001` hanya memuat
barang itu (tanpa `INV-2026-0009-PC`); `?q=zzzznothing` → empty state; tanpa sesi
→ 307 ke `/login?next=%2Fitems%2Flabels`.

Jalur pemotongan `LABELS_MAX` **tidak** tercakup smoke (butuh >200 barang), jadi
diuji terpisah: server dijalankan dengan `LABELS_MAX=3` di port 3101 → halaman
menampilkan "3 label siap dicetak (dibatasi dari 9 barang …)" dengan tepat 3 QR.

Belum: label belum bisa dicetak per **halaman daftar** (selalu seluruh hasil
filter), dan belum ada pilihan ukuran label (mis. 1 label per baris untuk printer
stiker). Ukuran sekarang 3 kolom di A4.

## Paket 10 — `/movements`: filter + paginasi (sesi 19 Oktober 2026)

Butir ketiga Tier B. Halaman pergerakan sebelumnya hanya menampilkan
`listRecentMovements(100)` — tanpa filter, tanpa halaman. Untuk jejak audit itu
terlalu tumpul: tidak bisa menjawab "apa saja yang berubah di barang ini" atau
"apa yang terjadi bulan lalu".

Perubahan:

- `src/lib/queries.ts` — `MovementFilters`, `buildMovementWhere()`,
  `MOVEMENTS_PER_PAGE = 25`, dan `listMovements()` (menggantikan
  `listRecentMovements()`; hanya halaman ini yang memakainya).
  Filter: `q` (nama **atau** kode barang), `reason` (alasan **atau** keterangan),
  `status` (status akhir `toStatus`), `from`/`to` (tanggal lokal, inklusif).
  Tanggal divalidasi "bulat" — `2026-02-31` diabaikan, bukan digeser ke Maret.
- `src/components/movements/movements-toolbar.tsx` (baru) — cari barang & alasan
  (debounce 350 ms), status akhir, rentang tanggal, reset, jumlah catatan.
- `src/app/(app)/movements/page.tsx` — filter dibaca & divalidasi di halaman
  (status asing, halaman bukan angka, tanggal mustahil → default), tabel
  berpaginasi dengan "Halaman X dari Y" + tombol Sebelumnya/Berikutnya.

Keputusan: roadmap menyebut "jenis perubahan", tetapi membandingkan lokasi lama
≠ baru tidak bisa dinyatakan di `where` Prisma tanpa kolom turunan (perlu
migrasi + backfill). Yang dipakai: **status akhir** + teks alasan/keterangan —
keduanya bisa dijawab database hari ini. Kalau nanti benar-benar perlu
kategori perpindahan vs perubahan status, tambahkan kolom `kind` di
`ItemMovement` dan isi di satu tempat (`movementSchema`).

Verifikasi 19 Oktober 2026: `npx tsc --noEmit` hijau, `npx eslint` hijau,
`npm run build` hijau, **`smoke.ps1` 347 pemeriksaan, 0 gagal** (`exit 0`).
18 pemeriksaan baru: `?q=INV-2026-0001` memuat kode itu tanpa `INV-2026-0010`;
`?reason=Pemulihan` memuat "Pemulihan dari Sampah" tanpa "Dihapus ke Sampah";
`?status=MAINTENANCE` memuat "Perbaikan hidrolik" tanpa baris pemulihan;
`?q=zzzznothing` menampilkan empty state; `?from=2000-01-01&to=2000-12-31` kosong;
`?page=2` menampilkan "Halaman 2 dari 4" (79 catatan → 4 halaman);
`?status=BOGUS&page=abc&from=2026-02-31` tetap halaman 1.

Dua temuan saat verifikasi (keduanya di uji, bukan di kode utama):

1. Teks `Halaman {page} dari {pageCount}` dipecah React jadi tiga text node
   dengan penanda `<!-- -->`, sehingga assertion `'Halaman 2 dari'` tidak pernah
   cocok walau halamannya benar. Diubah menjadi satu template literal — satu
   text node, stabil untuk diuji dan sama tampilannya.
2. Asumsi "tidak ada pergerakan berstatus SOLD" salah (seed punya satu baris
   `SOLD`). Pemeriksaan empty state dipindah ke pencarian yang memang tidak ada,
   dan filter status diuji dengan status yang benar-benar menyaring.

## Paket 9 — ekspor mengikuti filter (sesi 19 Oktober 2026)

Butir kedua Tier B. `/api/export` dulu tidak menerima parameter apa pun: selalu
seluruh barang aktif, padahal halaman `/items` bisa difilter. Akibatnya berkas
yang diunduh bisa berbeda dengan yang dilihat pengguna — sumber kesalahan yang
khas saat orang mengira sudah mengirim "data yang tersaring".

Perubahan:

- `src/lib/item-filter-params.ts` (baru) — `parseItemFilters()` membaca sekaligus
  **memvalidasi** query string (status/kondisi/sumber yang tidak dikenal dibuang,
  `sort` jatuh ke `newest`, `page` dijaga ≥ 1), `hasActiveFilters()`, dan
  `toExportQuery()` untuk menyusun tautan ekspor.
- `src/lib/queries.ts` — `buildItemWhere()` dan `itemOrderBy()` diekstrak dari
  `listItems()`. Halaman daftar dan ekspor kini memakai **satu rumus filter**;
  kalau aturannya ditulis dua kali, cepat atau lambat keduanya berbeda.
- `src/app/api/export/route.ts` — `GET(request)` membaca query, memakai
  `buildItemWhere()`, menambahkan akhiran `-terfilter` pada nama berkas, dan
  header `X-Export-Filter` untuk penelusuran unduhan.
- `src/app/(app)/items/page.tsx` — `parseSearchParams()` memakai parser bersama,
  jadi daftar konstanta status/kondisi/sumber yang dulu diduplikasi di halaman
  sudah hilang.
- `src/components/items/items-toolbar.tsx` — tombol **"Ekspor .xlsx"** (tanpa
  filter) / **"Ekspor hasil filter"** (dengan filter) yang membawa query aktif.
  Ekspor penuh tetap tersedia di navbar.

Keputusan kecil: `sort` **tidak** ikut dikirim ke ekspor karena isi sheet selalu
diurutkan menurut kode barang per tahun (`groupItemsByCodeYear`) — mengirim
urutan tampilan hanya akan menyesatkan.

Verifikasi 19 Oktober 2026: `npx tsc --noEmit` hijau, `npx eslint` hijau,
`npm run build` hijau, **`smoke.ps1` 329 pemeriksaan, 0 gagal** (`exit 0`).
13 pemeriksaan baru: `?q=INV-2026-0009` memuat kode itu dan **tidak** memuat
`INV-2026-0001`; `?status=DISPOSED` memuat `INV-2026-0008` tanpa `INV-2026-0002`;
`?status=LOST` (tidak ada hasil) tetap 200 tanpa sheet tahun; nama berkas
berakhiran `-terfilter`; ekspor penuh tanpa akhiran itu; toolbar di
`/items?status=LOST` memuat "Ekspor hasil filter" dan `/api/export?status=LOST`,
sedangkan `/items` polos memuat "Ekspor .xlsx".

Temuan saat menguji: assertion pertama ("berkas tanpa hasil tidak memuat
`INV-2026-`") salah sasaran — sheet `Ringkasan` memuat catatan penjelas
`INV-2026-… → 2026`, jadi pemeriksaannya diarahkan ke kode barang konkret dan ke
ada/tidaknya sheet tahun.

## Paket 8 — impor `.xlsx` (sesi 19 Oktober 2026)

Butir pertama Tier B. Sampai sekarang barang hanya bisa dimasukkan satu per satu
lewat form, padahal berkas `.xlsx` sudah jadi format ekspor aplikasi ini.

Berkas baru:

- `src/lib/item-import.ts` — baca & parse murni. `parseItemWorkbook()` membaca
  **semua** sheet yang punya baris judul berisi `Nama` (sheet `Ringkasan`
  dilewati), `buildMasterIndex()` menyiapkan peta nama → id untuk pencocokan.
- `src/lib/actions/import.ts` — `importItemsAction()`: cek auth, batas ukuran
  (6 MB) & jenis berkas, lalu menyimpan baris satu per satu.
- `src/app/(app)/items/import/page.tsx` + `src/components/items/item-import-form.tsx`
  — halaman + form (`useActionState`), tabel baris gagal (sheet, nomor baris,
  pesan), dan tautan **Impor .xlsx** di header daftar barang.

Aturan yang dipilih (dan alasannya):

- **Kolom acuan = hasil ekspor sendiri** (`Kode`, `Nama`, `Kategori`, …), dengan
  beberapa alias untuk berkas buatan tangan (`Nama Barang`, `Harga Beli`, …).
  Kolom di luar daftar diabaikan; judul tak dikenal tidak dianggap error supaya
  berkas ekspor versi lama tetap bisa diimpor.
- **Default untuk kolom kosong**: jumlah 1, satuan `unit`, harga 0, kondisi
  `Baik`, status `Tersedia`, sumber `Kantor Pusat`. Hanya `Nama` yang wajib.
- **Validasi akhir memakai `itemSchema`** yang sama dengan form barang, jadi
  aturan (jumlah ≥ 1, panjang teks, pola kode) tidak bercabang dua.
- **Data master tidak pernah dibuat otomatis** — nama yang tidak ada di master
  menjadi error baris. Salah ketik harus terlihat, bukan jadi master sampah.
  Unit pengelola menerima format ekspor `Nama (KODE)`; kode ikut dicocokkan.
- **Kode yang sudah dipakai ditolak**, bukan ditimpa. Impor ulang berkas yang
  sama karenanya melaporkan semua baris sebagai duplikat — idempoten dari sisi
  "tidak menggandakan data", bukan "menimpa".
- **Kode kosong** → nomor berikutnya dibuat di memori (sekali hitung `max`
  sebelum loop), sehingga 100 baris tanpa kode tidak saling menabrak.
- **Satu baris = satu transaksi** (barang + pergerakan "Pencatatan awal (impor)").
  Baris gagal tidak membatalkan baris lain, tetapi tidak ada barang yang
  tersimpan tanpa catatan pergerakannya.
- **Tanggal divalidasi dengan pemeriksaan balik** (`validDate()`): `31/13/2026`
  ditolak, bukan digeser diam-diam oleh `new Date()` ke bulan berikutnya. Ini
  bug yang tertangkap saat menguji fixture, bukan saat menulis kode.
- Batas 500 baris & 6 MB (`bodySizeLimit` di `next.config.ts` sudah 6mb),
  laporan error dibatasi 50 baris pertama (jumlah totalnya tetap disebut).

Verifikasi 19 Oktober 2026:

- `npx tsc --noEmit` hijau, `npx eslint` (semua berkas baru) hijau,
  `npm run build` hijau (rute `/items/import` ikut ter-render).
- **Uji nyata lewat HTTP** memakai fixture `.xlsx` 5 baris (2 valid, 1 kategori
  fiktif, 1 kode duplikat, 1 tanggal mustahil, plus sheet `Ringkasan`):
  hasil `2 barang diimpor, 3 baris dilewati`; ketiga alasan muncul di laporan;
  baris valid tersimpan dengan `searchKey` terisi, `createdBy=admin`, dan
  pergerakan `Pencatatan awal (impor)`. Data uji dihapus lagi setelah itu.
- **`smoke.ps1` 316 pemeriksaan, 0 gagal** (`exit 0`) — 10 di antaranya baru:
  halaman impor (3), penolakan berkas non-xlsx (2), dan **impor ulang berkas
  ekspor** (5) yang membuktikan jalur parse + pencocokan kode berjalan pada
  berkas asli aplikasi (semua baris jadi duplikat, tidak ada data bertambah).
- Catatan: blok throttle memakai **IP acak per run** sekarang — status kunci
  disimpan in-memory per proses, jadi IP tetap membuat smoke gagal saat
  dijalankan dua kali pada server yang sama.

Yang **tidak** dicakup: jalur sukses impor tidak diulang di `smoke.ps1` supaya
smoke tidak menambah data (diuji manual seperti di atas); foto tidak diimpor;
impor belum punya mode "perbarui baris yang sudah ada".

## Paket 7 — throttle login (sesi 19 Oktober 2026)

Menutup Tier A #4 (butir terakhir Tier A). `loginAction` sebelumnya hanya
membandingkan password; satu password dipakai bersama, jadi POST `/login`
berulang bisa menebak tanpa hambatan.

Aturan yang dipakai (`src/lib/login-throttle.ts`):

- kunci per **IP klien** — dari `x-forwarded-for` (hop pertama), lalu `x-real-ip`,
  lalu `unknown` bila tidak ada header;
- jendela hitung 15 menit, maksimal **5 kegagalan**; kegagalan ke-5 mengunci IP
  itu **15 menit**, dan selama kunci aktif password yang benar pun ditolak;
- login berhasil menghapus catatan IP tersebut;
- peta dibatasi 1000 IP (entri kedaluwarsa dibuang lebih dulu) supaya memori
  tidak tumbuh tanpa batas;
- pesan ke pengguna menyebut sisa percobaan (`Password salah. Sisa 2 percobaan
  sebelum login dikunci.`), lalu `Login dikunci 15 menit untuk alamat ini.`

Pemeriksaan kunci dilakukan **sebelum** `verifyPassword()`, jadi tidak ada celah
"tebakan menyelip tepat saat password kebetulan benar". `verifyPassword()` tetap
waktu-tetap (`safeEqual`).

Status kunci disimpan **in-memory** (`Map` di `globalThis`, supaya tidak dobel
saat modul di-reload di dev): tidak ada tulis-baca DB di jalur login, tidak perlu
migrasi, tidak ada IP tersimpan di disk. Konsekuensi yang perlu diketahui:

- kunci hilang saat proses restart — untuk aplikasi satu-instance ini
  dapat diterima;
- bila nanti jalan di beberapa instance/worker, `store` harus pindah ke tabel
  atau Redis supaya kuncinya berlaku menyeluruh;
- penyerang yang punya banyak IP masih bisa ~5 tebakan per IP; lapisan berikutnya
  adalah password kuat (sudah, Paket 6), HTTPS, dan rate-limit di reverse proxy.
  Belum ada backoff bertahap — baru mengunci setelah 5 kegagalan.

Perubahan `smoke.ps1`: `Submit-Login` dapat parameter kedua untuk mengirim
`X-Forwarded-For` (menguji kunci per IP tanpa saling mengunci), assertion pesan
gagal dilonggarkan menjadi `Password salah.` (karena kini menyebut sisa
percobaan), dan blok **THROTTLE LOGIN** dijalankan **paling akhir** karena
efeknya menempel pada proses server.

Verifikasi 19 Oktober 2026: `npx tsc --noEmit` hijau, `npx eslint` (kedua file)
hijau, `npm run build` hijau, **`smoke.ps1` 306 pemeriksaan, 0 gagal** (`exit 0`)
terhadap `next start -p 3100` — 17 di antaranya baru: 5 kegagalan beruntun →
kunci, password benar saat terkunci tetap ditolak, IP lain tetap bisa login.
Probe modul langsung: hitungan 5→4→3→2→1, `clearLoginThrottle` mengembalikan
sisa ke 5, `retryAfterSeconds` 900, dan `loginThrottleKey` benar untuk
`x-forwarded-for` berantai, `x-real-ip`, maupun tanpa header.

## Paket 6 — rahasia tanpa fallback hardcoded (sesi 19 Oktober 2026)

Menutup Tier A #3. `src/lib/session.ts` sebelumnya memakai
`SESSION_SECRET ?? "dev-only-insecure-secret-change-me"` dan
`APP_PASSWORD ?? "admin"` — dua nilai yang **tertulis di repo**. Server produksi
yang lupa memasang `.env` jadi memakai penanda tangan cookie yang publik (cookie
sesi bisa dipalsukan) sekaligus password login `admin`.

Perubahan:

- `getSessionSecret()` dan `getAppPassword()` (baru) memeriksa env **saat
  dipanggil**, bukan saat modul diimpor — supaya `next build` tidak menuntut
  rahasia produksi dan halaman statis tetap bisa di-prerender.
- Di `NODE_ENV === "production"`, kondisi berikut membuat fungsi **melempar
  error** dengan pesan yang menyebut variabel bermasalah + cara membuat nilainya:
  env kosong, `SESSION_SECRET` sama dengan placeholder repo, `SESSION_SECRET`
  < 32 karakter, `APP_PASSWORD` kosong, atau `APP_PASSWORD` termasuk daftar
  password yang sudah beredar di repo (`admin`, `password`, `123456`, …).
- Di `next dev` perilaku lama dipertahankan (fallback `admin` / placeholder)
  supaya pengembangan lokal tidak butuh `.env` lengkap.
- `verifyPassword()` membandingkan dengan `getAppPassword()` dan tetap memakai
  `safeEqual()` (perbandingan waktu-tetap).
- `.env.example` **tidak lagi** memuat nilai contoh yang lolos: `APP_PASSWORD`
  dan `SESSION_SECRET` dikosongkan + instruksi pembuatan; `README.md` menandai
  keduanya **wajib di produksi** (secret minimal 32 karakter).
- `.env` lokal dirotasi: `SESSION_SECRET` 64 hex baru, `APP_PASSWORD` baru (bukan
  `admin`). Konstanta `$secret` di `smoke.ps1` disinkronkan (dipakai untuk
  memeriksa HMAC cookie); password login tetap dibaca skrip dari `.env`.

Verifikasi 19 Oktober 2026: probe langsung ke kedua fungsi untuk 7 kombinasi
(kosong, placeholder, pendek, password default, valid, dev-fallback) — semua
sesuai harapan; `npx tsc --noEmit` hijau; `npx eslint src/lib/session.ts` hijau;
`npm run build` hijau; **`smoke.ps1` 289 pemeriksaan, 0 gagal** (`exit 0`)
terhadap `next start -p 3100`, termasuk login password baru (303 + cookie) dan
penolakan password salah.

Catatan untuk sesi berikutnya: bila `.env` di mesin lain masih memakai
placeholder, aplikasi **sengaja gagal** — itu bukan regresi. Rotasi
`SESSION_SECRET` membatalkan semua cookie sesi yang beredar (semua pengguna
harus login ulang).

## Paket 4 — Kode barang otomatis + QR & label cetak (sesi 12 Oktober 2026)

Tujuan: berhenti mengetik kode manual, sekaligus memberi tiap barang label
cetak yang bisa dipindai.

### 1. Skema & migrasi

`Item.assetType String?` ditambahkan (nullable, jadi barang lama tetap sah),
migrasi `prisma/migrations/20261012040005_add_item_asset_type`. Jenis barang
**bukan** kategori: kategori (`categoryId`, dikelola di `/master`) menjawab
"barang apa", sedangkan `assetType` adalah klasifikasi aset berlabel pendek.

### 2. Konstanta & validasi

- `src/lib/constants.ts`: `ITEM_TYPE_VALUES`
  (`PC`, `LPT`, `PRN`, `MON`, `NET`, `MOB`, `FRN`, `ELE`, `LAIN`),
  `ITEM_TYPE_LABELS`, `isItemTypeCode()`, `buildItemCode()`,
  `itemCodeSequence()`, `itemTypeLabel()`.
- `src/lib/validations.ts`: `code` kini **optional** (preprocess string kosong →
  `undefined`) dan `assetType` berupa enum optional. Kode tidak lagi bagian dari
  kontrak form, tapi tetap divalidasi ketat bila diisi.

### 3. Kode dibuat server, bukan klien

`generateItemCode()` di `src/lib/actions/items.ts` mencari urutan terbesar dari
kode berformat `INV-<tahun>-*` lalu menerbitkan nomor berikutnya (tidak mendaur
ulang nomor, walau barang lama sudah dihapus) dan menyambung suffix jenis.
`createItemAction` memakainya saat form tidak mengirim kode; `updateItemAction`
memakai kode dari form, atau mempertahankan kode lama bila kolom dikosongkan.
`toItemWriteData(data, searchKey, code)` (`src/lib/action-utils.ts`) menerima
kode hasil keputusan server ini.

Verifikasi runtime: barang uji tanpa kode terbit sebagai
**`INV-2026-0011-PC`** (jenis PC) — sesuai harapan, dan `@unique` pada
`Item.code` tetap menjadi jaring pengaman bila terjadi tabrakan.

### 4. Form barang

`src/components/items/item-form.tsx`: kolom Kode tidak lagi `required` dan
diberi hint "Kosongkan untuk dibuat otomatis", plus Select **Jenis barang**
baru (`ItemFormValues.assetType`, `EMPTY_ITEM_FORM.assetType`). Halaman
`/items/[id]/edit` mengisi `assetType` dari item supaya tidak ter-reset.

### 5. QR & halaman label

- `src/lib/qr.ts`: `itemDetailUrl()`, `requestOrigin()` (origin dari header
  request), dan `qrSvg()` yang memakai library `qrcode` untuk mengeluarkan SVG
  inline — tanpa layanan gambar eksternal, jadi label tetap bisa dicetak offline.
- `src/app/(app)/items/[id]/label/page.tsx`: halaman label (QR + kode + nama +
  jenis + kondisi + lokasi + status), tombol **Cetak label**
  (`src/components/print-button.tsx`, komponen klien berisi `window.print()`),
  dan CSS `@media print` dengan `.print-area` supaya hanya label yang tercetak.
  Halaman ini dibungkus `<Suspense>` karena membaca header request (aturan
  Cache Components) — hasilnya rute **Partial Prerender**.
- Kartu **Label QR** + tombol "Cetak label" juga muncul di detail barang
  (`/items/[id]`), bersama baris `Jenis barang`.
- **QR memuat URL `/items/<id>`, bukan kodenya** — keputusan sadar: label tetap
  valid walau kode/nama barang nanti diubah, dan bisa langsung membuka halaman
  detail. Konsekuensinya `requestOrigin()` membaca header request, jadi dari HP
  label hanya berfungsi bila aplikasi diakses lewat alamat jaringan/domain, bukan
  `localhost`.

### 6. `smoke.ps1`: 157 → 180 pemeriksaan (23 baru)

Bagian **KODE OTOMATIS, JENIS BARANG & LABEL QR**:

- `id="code"` ada tapi **tanpa** atribut `required` + hint
  `Kosongkan untuk dibuat otomatis`, dan pilihan jenis `PC`/`LPT` benar-benar
  ter-render;
- detail barang memuat `Jenis barang`, `Label QR`, `Cetak label`, tautan
  `/items/<id>/label`, QR berupa `<svg`, dan **tidak** menunjuk layanan gambar
  pihak ketiga;
- `/items/[id]/label` → 200, memuat `<svg`, aturan cetak `print-area`, kode yang
  **sama** dengan halaman detail, dan tautan QR ke `/items/<id>`.
- Bagian ini tidak menulis apa pun ke DB (kode otomatis sudah diverifikasi
  langsung via POST saat pengembangan), jadi angka dashboard tidak terpengaruh.

### 7. Barang contoh (seed) ikut memakai format baru

Supaya data contoh tidak lagi jadi pengecualian, `prisma/seed.ts` diperbarui:
kesepuluh fixture kini punya kode bersuffix jenis (`INV-2026-0001-LPT`,
`INV-2026-0002-MON`, `INV-2026-0003-NET`, `INV-2026-0004-ELE`,
`INV-2026-0005-FRN`, `INV-2026-0006-FRN`, `INV-2026-0007-ELE`,
`INV-2026-0008-PRN`, `INV-2026-0009-PC`, `INV-2026-0010-FRN`) **dan** kolom
`assetType` (`LPT`, `MON`, `NET`, `ELE`, `FRN`, `PRN`, `PC`) yang ikut ditulis
ke `Item.assetType`. Field `assetType` ditambahkan ke tipe `SeedItem`, dan
`first`/`sixth` (pemilik riwayat pergerakan) mencari kode yang baru.

DB pengembangan yang sudah berisi data lama dirapikan **sekali jalan** dengan
skrip sementara (`npx tsx`): `code` + `assetType` tiap baris diperbarui dan
token kode di `searchKey` ditukar, lalu `npm run seed` menulis ulang seluruh
isinya (termasuk `searchKey`) sehingga hasilnya identik dengan seed baru.
`ItemMovement` menunjuk `itemId`, jadi **id barang, `createdAt`, tautan label
QR, dan seluruh angka dashboard tidak berubah** — hanya kode yang dibaca
manusia yang berganti. Skrip sementaranya dihapus setelah dipakai.

Yang tetap **tidak** disentuh: kode manual/legacy milik pengguna. Server tidak
pernah menulis ulang kode yang sudah ada, dan saat mengedit kode dipertahankan
bila kolomnya dikosongkan.

Verifikasi: `npm run lint` + `npx tsc --noEmit` hijau, `npm run seed` hijau
(10 barang), dan smoke naik 176 → **180 pemeriksaan, 0 gagal** dengan 4
pemeriksaan baru — daftar barang memuat `INV-2026-0001-LPT`, ekspor CSV memuat
`INV-2026-0001-LPT`, dan pencarian `?q=INV-2026-0009-PC` menemukan
`PC Desktop HP ProDesk 400` (bukti `searchKey` memakai kode baru, sehingga
filter berbasis kode tetap jalan).

### 8. Jebakan yang ditemui

- **Regex kode harus toleran dua format.** Sejak fixture seed ikut bersuffix,
  kode di data contoh selalu punya akhiran jenis, tetapi kode manual/legacy
  tanpa suffix tetap sah. Karena itu polanya `INV-\d{4}-\d{4}(-[A-Z]+)?` —
  bukan `INV-\d{4}-\d{4}-[A-Z]+` yang hanya cocok untuk kode baru.
- **Verifikasi kode otomatis lewat POST butuh skrip khusus, dan itu mengotori
  data.** Barang uji harus dihapus lagi (hard delete + movement-nya) supaya
  angka dashboard & ekspor CSV kembali seperti kondisi seed; seed **tidak**
  menghapusnya sendiri. Setelah dipakai, skrip sementara dihapus
  (`tmp-verify-code.ps1`, `tmp-cleanup.ts`).
- **Skrip verifikasi manual: pakai `HttpWebRequest`, bukan `HttpClient`.**
  `HttpClient` membuang `Cookie` manual; selain itu cookie sesi hanya keluar dari
  respons **POST `/login` yang pertama** (POST ulang → 400).
- **Data di luar aplikasi = cache SWR menyajikan isi lama sekali.** Setelah
  `npm run seed`/hapus manual, render pertama `/items/terhapus` masih bisa kosong;
  jalankan `smoke.ps1` **dua kali** (run pertama "memanaskan" cache) atau GET
  halaman itu dua kali.
- **`prisma db execute --stdin` tidak jalan di shell ini** (gagal karena
  `prisma7.config.ts` + redirection PowerShell). Untuk operasi DB ad-hoc pakai
  `npx tsx` + `prisma` dari `src/lib/prisma.ts` (atau `npm run seed`).

## Paket 3 — Sampah: soft delete & pemulihan (sesi 12 Oktober 2026)

Tujuan: menutup bug **"pintu satu arah"**. Barang bisa dihapus (soft delete,
`Item.deletedAt`), tetapi **tidak pernah bisa dipulihkan**: tombol Pulihkan di
halaman detail adalah kode mati.

### 1. Akar masalahnya struktural, bukan kosmetik

`getItem()` di `src/lib/queries.ts` memfilter `deletedAt: null`. Jadi begitu
barang dihapus, halaman detailnya berhenti menemukannya (`notFound()`) — aksi
`restoreItemAction` yang sudah ada **tidak akan pernah tercapai**, karena
tombolnya hanya dirender di halaman detail yang sudah tidak bisa dibuka.
Barang terhapus juga tidak punya daftar sendiri, sehingga tidak ada jalan masuk
lain ke datanya.

Perbaikannya satu baris kunci: `getItem()` memakai `findUnique` **tanpa** filter
`deletedAt`, lalu pemanggilnya yang memutuskan (halaman detail tetap bisa
dibuka dan menampilkan alert "sudah dihapus", halaman edit memanggil
`notFound()`). Fungsi baru `listDeletedItems()` mengembalikan baris dengan
`deletedAt: { not: null }`.

### 2. Aksi pemulihan & jejak audit

Keputusan yang perlu diketahui: `deleteItemAction` mengisi `deletedAt`
**dan** memaksa `status = "DISPOSED"`, sehingga status sebelum dihapus (mis.
`IN_USE`) **tidak dipertahankan**. Karena itu kolom "Status terakhir" di
halaman Sampah selalu `Dibuang`, dan pemulihan selalu mengembalikan barang ke
`AVAILABLE` — bukan ke status lamanya. Ini konsisten dengan teks di UI
("Pemulihan mengembalikan statusnya ke Tersedia"); kalau nanti ingin
mempertahankan status asli, perlu kolom tambahan (mis. `statusBeforeDelete`)
karena `Item.status` tidak menyimpan jejaknya.

`restoreItemAction` (`src/lib/actions/items.ts`):

- menolak item yang **tidak** dalam keadaan terhapus (idempoten, tidak bisa
  dipakai "menyegarkan" barang aktif);
- dalam **satu transaksi** mengembalikan `deletedAt = null` + status →
  `AVAILABLE`, dan menulis baris `ItemMovement` ber-`reason`
  `"Pemulihan dari Sampah"` (`fromStatus` = status terakhir, `toStatus` =
  `AVAILABLE`);
- `updateTag(CACHE_TAGS.items)` supaya daftar aktif, Sampah, dashboard, dan
  riwayat langsung konsisten.

### 3. Halaman Sampah (`/items/terhapus`)

File baru `src/app/(app)/items/terhapus/page.tsx`: tabel barang terhapus
(kode, nama + merek/lokasi, waktu dihapus, status terakhir, nilai), tombol
**Pulihkan** per baris, `Suspense` + skeleton, dan empty state `Sampah kosong`.
Row-nya menautkan ke halaman detail barang, tempat konteks penghapusan
(`Alasan dibuang`, alert "Barang ini sudah dihapus…") tetap terbaca — jadi data
audit tidak hilang walau barang keluar dari daftar aktif.

`src/components/items/restore-item-button.tsx` (client) memanggil aksi lalu
`router.refresh()` dan **tetap di halaman Sampah** (berbeda dari tombol di
halaman detail yang redirect). Form-nya tetap server action, jadi jalur
progressive-enhancement (tanpa JavaScript) juga berfungsi.

### 4. Guard di UI

- `/items/[id]`: barang terhapus tidak menampilkan tombol **Edit** dan tidak
  menampilkan `MovementForm` (mencegah pergerakan baru pada barang yang sudah
  keluar dari daftar aktif).
- `/items/[id]/edit`: `notFound()` untuk barang terhapus — link lama tidak bisa
  dipakai menyunting barang di Sampah.
- `src/components/app-nav.tsx`: menu **Sampah** ditambahkan, dan penentuan menu
  aktif diubah dari `startsWith` menjadi **prefix terpanjang** supaya
  `/items/terhapus` tidak ikut menyalakan menu `/items` (dua `aria-current` di
  satu halaman).

### 5. Seed

`prisma/seed.ts` menambah fixture ke-10 yang **sudah terhapus**:
`INV-2026-0010` "Lemari Arsip Besi Lion" (DAMAGED, `DISPOSED`, `deletedAt` 10
hari lalu, `disposalReason: "Rusak berat"`). Karena ter-soft-delete, fixture ini
**tidak mengubah** angka dashboard/ekspor (nilai aset aktif tetap
Rp 100.350.000) namun selalu tersedia untuk diuji. Field `deletedAt` ikut
ditulis di cabang `update` upsert supaya seed berulang tetap mengembalikannya ke
kondisi terhapus.

### 6. `smoke.ps1`: 117 → 157 pemeriksaan (40 di antaranya bagian Sampah)

Bagian **SAMPAH (soft delete & pemulihan)** menguji:

- `/items/terhapus` memuat barang terhapus + tombol Pulihkan, sementara barang
  itu **absen** dari `/items` dan dari CSV;
- hanya **satu** menu bertanda `aria-current="page"` di `/items/terhapus`
  (aturan prefix terpanjang);
- halaman detail barang terhapus: memuat alert `Barang ini sudah dihapus`,
  tombol Pulihkan, `Alasan dibuang`/`Rusak berat`, **tanpa** `Catat pergerakan`
  dan tanpa link `/edit`; `/edit`-nya menampilkan `Barang tidak ditemukan`;
- **pemulihan sungguhan**: form di halaman Sampah dikirim sebagai POST multipart
  (jalur tanpa JavaScript), lalu diverifikasi barang kembali di daftar aktif,
  hilang dari Sampah (`Sampah kosong`), pergerakan baru muncul, dan jumlah
  riwayat di halaman detail **bertambah tepat satu**;
- di akhir, barang dihapus lagi (POST form Hapus) supaya isi Sampah kembali
  seperti kondisi seed.

Catatan: jumlah baris audit `Pemulihan dari Sampah` **bertambah permanen** di
setiap run smoke (itu memang jejak audit, bukan sampah data) — karena itu
pemeriksaan riwayat dihitung sebagai **delta**, bukan "teks ada/tidak".

Angka nyata (diperiksa langsung dari DB): baseline seed hanya **2 pergerakan**
(`Penyerahan ke Divisi IT`, `Perbaikan hidrolik`), sementara baris audit
pemulihan sudah menumpuk dari run-run sebelumnya — mis. `movements=9` =
2 fixture + 7 `Pemulihan dari Sampah`. Penyebabnya `prisma/seed.ts`: movement
hanya dibuat bila barang itu **belum punya** (`itemMovement.count() === 0`) dan
seed **tidak pernah** `deleteMany` movement lama, sehingga angka "pergerakan"
yang dicetak seed naik 1 tiap smoke. Untuk reset betul-betul bersih: hapus
`dev.db` → `npx prisma migrate deploy` → `npm run seed` (fixture `deletedAt`
INV-2026-0010 akan dibuat ulang di kondisi terhapus).

## Paket 2 — Cabang & pelepasan aset (sesi 9 Oktober 2026)

Tujuan: memisahkan tiga dimensi yang sebelumnya tercampur, dan membuat dashboard
melaporkan **nilai aset aktif** (tanpa barang `DISPOSED` / `SOLD`).

| Dimensi | Pertanyaan | Kolom |
| --- | --- | --- |
| `Category` | barang **apa** | `Item.categoryId` |
| `Location` | barang **di mana** | `Item.locationId` (+ `Location.branchId`) |
| Perolehan / kepemilikan | barang **milik siapa / dibeli siapa** | `Item.acquisitionSource`, `Item.sourceBranchId`, `Item.ownerBranchId` |

### 1. Skema & migrasi

Migrasi `20261009034030_add_branch_acquisition_disposal` (sudah diterapkan):

- Model baru **`Branch`** (`code` unik, `name` unik, `notes`) + relasi
  `Location.branchId` (nullable, `onDelete: SetNull`) — cabang **lokasi fisik**.
- `Item.acquisitionSource` enum `AcquisitionSource` (`HEAD_OFFICE` default,
  `BRANCH`) + `Item.sourceBranchId` → **siapa yang membeli**.
- `Item.ownerBranchId` → **pemilik aset** (`null` = Kantor pusat).
- Metadata pelepasan: `Item.disposedAt`, `Item.disposalReason`, `Item.soldAt`,
  `Item.soldPrice`.

Prinsip yang dipegang: `price` tetap **harga satuan** dan **tidak** dinolkan saat
barang dibuang/dijual (jejak audit tetap utuh). Barang keluar dari "nilai aset
aktif" karena **statusnya**, bukan karena harganya diubah.

### 2. Server sebagai sumber kebenaran

- `src/lib/action-utils.ts`: `toItemWriteData()` menyelaraskan metadata pelepasan
  pada **setiap** penulisan — status bukan `DISPOSED` → `disposedAt` /
  `disposalReason` dibersihkan; status bukan `SOLD` → `soldAt` / `soldPrice`
  dibersihkan; `sourceBranchId` hanya disimpan kalau sumbernya `BRANCH`.
- `buildItemSearchKey()` ikut memasukkan nama + kode cabang (lokasi, pembeli,
  pemilik) dan `disposalReason`, jadi mengetik "bandung" atau "tidak ekonomis"
  langsung menemukan barangnya.
- `src/lib/validations.ts`: `branchSchema` + field baru di `itemSchema`
  (`acquisitionSource`, `sourceBranchId`, `ownerBranchId`, `disposedAt`,
  `disposalReason`, `soldAt`, `soldPrice`). Helper `enumOrDefault()` mengubah
  string kosong dari `<select>` menjadi nilai default sebelum validasi.

### 3. Dashboard (`src/app/(app)/page.tsx` + `getDashboardStats()`)

- Kartu nilai berubah menjadi **"Nilai aset aktif"** (`activeValue`), dengan hint
  `Dari Rp … nilai perolehan` (`totalValue`) supaya angka lama tidak hilang.
- Kartu baru **"Nilai aset aktif per cabang"** — dihitung dari **kepemilikan**
  (`ownerBranchId`), bukan lokasi fisik; `null` → "Kantor pusat".
- Kartu baru **"Pelepasan aset"**: total perolehan / dibuang (`disposedValue`) /
  dijual (`soldValue`) / hasil penjualan (`soldProceeds` = jumlah `soldPrice`
  sebenarnya, bukan harga beli).
- Baris "Status barang" tetap memakai `totalItems`, sedangkan tabel kategori dan
  kolom **Porsi** memakai `activeValue` sebagai penyebut — jadi porsinya
  benar-benar berjumlah 100% dari aset yang masih dimiliki.

> Perhatikan bedanya: **filter** `branchId` di `/items` memakai cabang **lokasi**
> (`where: { location: { branchId } }`), sedangkan **dashboard** memakai
> **kepemilikan**. Ini disengaja: "barang ini ada di mana" vs "aset ini milik
> siapa" adalah dua pertanyaan berbeda.

### 4. UI & ekspor

- `/master`: section **Cabang** (data-driven `MasterManager` + `saveBranchAction`
  / `deleteBranchAction`), dan field **Cabang** pada Lokasi.
- `item-form.tsx`: kartu "Perolehan & kepemilikan" (sumber, cabang pembeli,
  pemilik) + kartu "Pelepasan aset" (tanggal & alasan dibuang, tanggal & harga
  jual) yang hanya relevan untuk status `DISPOSED` / `SOLD`.
- `/items`: filter **Cabang lokasi** + **Sumber**, kolom tabel **Lokasi / cabang**
  dan **Sumber** (badge sumber + nama cabang pembeli).
- `/items/[id]` & `/items/[id]/edit`: baris "Sumber perolehan", "Cabang pembeli",
  "Pemilik aset", dan (kondisional) "Tanggal dibuang" / "Alasan dibuang" /
  "Tanggal jual" / "Harga jual", plus alert yang menegaskan harga perolehan tetap
  tersimpan untuk audit tetapi tidak dihitung sebagai aset aktif.
- `/api/export`: kolom baru `Cabang Lokasi`, `Sumber Perolehan`, `Cabang Pembeli`,
  `Pemilik Aset`, `Tanggal Dibuang`, `Alasan Dibuang`, `Tanggal Jual`,
  `Harga Jual` (pemilik kosong ditulis "Kantor pusat").

### 5. Seed

`prisma/seed.ts` sekarang: 3 cabang (Kantor Pusat/PST, Cabang Bandung/BDG,
Cabang Surabaya/SBY), 5 lokasi (2 di antaranya di cabang), 5 merek (tambah HP),
**9 barang**, 2 pergerakan. `main()` membuat cabang lebih dulu, memetakan
`branch` → `branchId` untuk lokasi, lalu mengisi field perolehan/pelepasan tiap
barang lewat lookup map (nama → id).

Angka acuan dari seed (dipakai di `smoke.ps1`):

| Ukuran | Nilai |
| --- | --- |
| Nilai perolehan (`totalValue`) | Rp 112.600.000 |
| Dibuang (`disposedValue`) | Rp 1.850.000 |
| Dijual (`soldValue`) | Rp 10.400.000 |
| **Nilai aset aktif** (`activeValue`) | **Rp 100.350.000** |
| Hasil penjualan (`soldProceeds`) | Rp 3.500.000 |
| Aset aktif Kantor pusat / Bandung / Surabaya | 64.450.000 / 29.100.000 / 6.800.000 |

### 6. `smoke.ps1`: 68 → 117 pemeriksaan

Tambahan yang diuji: **login sungguhan** (POST form server action — password
benar → 303 + `Set-Cookie`, password salah → 200 + `Password salah. Coba lagi.`
tanpa cookie, lalu cookie hasil login dipakai membuka `/`), label & angka
dashboard (`Nilai aset aktif`, `112.600.000`, `100.350.000`, `1.850.000`,
`10.400.000`, `3.500.000`, `nilai perolehan`, `Nilai aset aktif per cabang`,
`3 cabang terdaftar`, `Pelepasan aset`, `Hasil penjualan`), filter
`/items?branchId=<id>` (id cabang **dibaca dari HTML toolbar**, jadi tidak ada id
yang di-hardcode) dan `/items?acquisitionSource=…`, pencarian teks `?q=bandung` &
`?q=tidak ekonomis` (membuktikan `searchKey` menyertakan cabang & alasan
pembuangan), section Cabang di `/master`, serta alur barang dijual
(`/items?q=INV-2026-0009` → detail: `Barang ini sudah`,
`tidak dihitung dalam nilai aset aktif`, `Tanggal jual`, `Pemilik aset`).


## Yang dikerjakan sesi 9 Oktober 2026 (paket 1)

### 1. UI 404 kustom (menutup TODO #1)

`notFound()` di `/items/[id]` dan `/items/[id]/edit` terbukti **bekerja**;
status HTTP 200-nya memang perilaku resmi Next.js saat `notFound()` dipanggil
setelah shell streaming (lihat penjelasan lengkap di bagian TODO di bawah).
Yang kurang hanya UI-nya: belum ada `not-found.tsx` sehingga yang muncul adalah
halaman 404 default bawaan Next.js di dalam kerangka aplikasi.

File baru:

- `src/app/(app)/items/[id]/not-found.tsx` — berlaku juga untuk
  `/items/[id]/edit` (boundary not-found terdekat di atasnya). Isinya
  `EmptyState` + `ButtonLink` "Kembali ke daftar barang".
- `src/app/not-found.tsx` — fallback global untuk URL yang tidak cocok rute
  mana pun. Dirender hanya di dalam `app/layout.tsx` (tanpa nav aplikasi),
  jadi pembungkusnya mandiri + punya `export const metadata` untuk `<title>`.

### 2. `smoke.ps1` diperluas: 39 → 57 pemeriksaan

Tambahan yang diuji:

- `/items/doesnotexist1234567890` → 200, memuat `Barang tidak ditemukan`,
  memuat `noindex`, dan **tidak** memuat `Data barang` / `Riwayat pergerakan`.
- `/items/doesnotexist1234567890/edit` → 200, memuat `Barang tidak ditemukan`,
  tidak memuat `Simpan Perubahan`.
- `/items?q=zzzznothing`, `/items?status=LOST`, `/items?page=999` → 200 dan
  menampilkan empty state `Belum ada barang yang cocok`.
- `/halaman-tidak-ada-xyz` (tidak cocok rute mana pun) → **404 asli** dan
  memuat UI global `Halaman tidak ditemukan`.

Helper `HasText` juga diperbaiki: pemeriksaan negatif sekarang mencetak
`TIDAK memuat '<teks>'` supaya log tidak menyesatkan
(sebelumnya ikut mencetak `memuat`).

### 3. Dokumentasi

- `README.md`: ditambah ringkasan project, tabel variabel lingkungan
  (`DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`), dan bagian
  "Verifikasi (smoke test)".
- Nama variabel di catatan ini dikoreksi dari `INVENTORY_SESSION_SECRET`
  menjadi **`SESSION_SECRET`** (sesuai `.env` dan `src/lib/session.ts`), dan
  lokasi skrip dikoreksi dari `scripts/smoke.ps1` menjadi **`smoke.ps1`**
  (tidak ada folder `scripts/` di project ini).

### 4. Dashboard: bug nilai inventaris + keterbacaan

**Bug.** `price` adalah **harga satuan** — form barang berlabel
`Harga satuan (Rp)` dan halaman detail barang menulis
`Total nilai = price * quantity`. Tetapi `getDashboardStats()` memakai
`_sum: { price: true }`, jadi "Nilai inventaris" hanya menjumlahkan harga satuan
tanpa dikali jumlah unit.

| Sumber | Nilai (data seed) |
| --- | --- |
| Dashboard sebelum perbaikan | Rp 33.850.000 |
| Nilai sebenarnya | Rp 102.200.000 |

Contoh paling jelas: Laptop Dell `quantity: 3`, `price: 14.500.000` → dashboard
menghitung 14,5 jt sementara halaman detail barangnya sendiri menulis 43,5 jt.
Masalah yang sama juga ada di tabel "Barang per kategori".

Perbaikan di `src/lib/queries.ts`: `aggregate` / `groupBy` Prisma tidak bisa
mengalikan dua kolom, jadi baris `{ price, quantity, categoryId, status,
condition }` diambil lalu dijumlahkan di JS (`price * quantity`). Tetap portabel
untuk SQLite maupun PostgreSQL, dan sekaligus **memangkas satu query** —
`groupBy` per kategori tidak lagi diperlukan karena agregasinya dilakukan di JS.

**Keterbacaan** (`src/app/(app)/page.tsx`):

- Kartu ringkasan 3 → 4. Kartu baru **"Perlu perhatian"**: status `MAINTENANCE`
  atau `LOST`, atau kondisi `NEEDS_REPAIR` / `DAMAGED` yang statusnya masih
  aktif (barang `DISPOSED` / `SOLD` tidak dihitung karena urusannya selesai).
- "Kategori terdaftar" diganti **"Kategori terpakai"** dengan hint
  `dari N kategori terdaftar`. Sebelumnya kartu itu menampilkan **2** padahal
  master berisi 3 kategori, karena yang dihitung hanya kategori yang punya
  barang — labelnya menyesatkan.
- Baris **Status barang** kini punya bar proporsi + persentase terhadap total
  inventaris, dan bisa diklik ke `/items?status=...` (dulu angka mati, tidak ada
  jalan menuju barangnya).
- Tabel **Barang per kategori** dapat kolom **Porsi** (persentase + bar),
  diurutkan menurut nilai (dulu menurut jumlah jenis), dan nama kategori bisa
  diklik ke `/items?categoryId=...`.
- **Barang terbaru** menampilkan jumlah unit (`· 3 pcs`) dan harganya diberi
  label `per pcs` supaya jelas itu harga satuan, bukan total.
- Helper `Bar` baru di `page.tsx`; warna bar lewat `ITEM_STATUS_BAR` di
  `src/lib/constants.ts`, selaras dengan `ITEM_STATUS_BADGE` yang sudah ada.

### 5. `smoke.ps1`: 57 → 68 pemeriksaan

Tambahan untuk dashboard: `102.200.000` ada, `33.850.000` **tidak** ada,
`Harga satuan`, `jumlah unit`, `Kategori terpakai`,
`dari 3 kategori terdaftar`, `Perlu perhatian`, `1 perbaikan`, `Porsi`,
`per pcs`, `/items?status=AVAILABLE`, dan `/items?categoryId=`.

> **Jangan pakai karakter non-ASCII** (`×`, `·`) sebagai needle di `smoke.ps1`.
> Windows PowerShell 5.1 membaca skrip UTF-8 **tanpa BOM** sebagai ANSI,
> sehingga pencocokan gagal — `×` terbaca `A-` di log. Pakai potongan ASCII
> (`Harga satuan`, `jumlah unit`) dan bukan kalimat penuh.

### 6. Lint hijau

`src/components/master/master-manager.tsx` memicu
`react-hooks/set-state-in-effect`:

```tsx
useEffect(() => { if (state.ok) setEditing(null); }, [state.ok]);
```

Diganti dengan pola resmi React *"adjusting state when props change"* —
penyesuaian dilakukan saat render dengan pembanding state sebelumnya, jadi
tidak ada cascading render dan `useEffect` bisa dibuang dari import:

```tsx
const [handledState, setHandledState] = useState(state);
if (state !== handledState) {
  setHandledState(state);
  if (state.ok) setEditing(null);
}
```

`npm run lint` sekarang **exit 0**.

## Yang dikerjakan sesi 8 Oktober 2026

### 1. Fix build error: `new Date()` saat prerender (`src/app/(app)/page.tsx`)

Error yang muncul:

```
Error: Route "/": Next.js encountered the unstable value `new Date()` while prerendering.
  at daysUntil (src/lib/format.ts:68:48)
  at src/app/(app)/page.tsx:195:37
```

Penyebab: kartu "Garansi segera habis" memanggil `daysUntil(item.warrantyUntil)`
yang membaca `new Date()`. Cache Components menolak nilai waktu tidak stabil di
dalam shell statis.

Perbaikan (mengikuti saran resmi Next.js `blocking-prerender-current-time`):
tambahkan `import { connection } from "next/server";` lalu `await connection();`
sebagai baris pertama di `DashboardContent()` — sebelum `Promise.all([...])`.

```ts
async function DashboardContent() {
  await connection(); // render saat request, bukan saat prerender
  const [stats, expiring] = await Promise.all([
    getDashboardStats(),
    listExpiringWarranty(60),
  ]);
  ...
}
```

Catatan: data tetap dilayani cache `"use cache"` di `src/lib/queries.ts`, jadi
`connection()` hanya memindahkan boundary render, bukan mematikan cache.
`DashboardPage` tetap sinkron dan `DashboardContent` tetap dibungkus `<Suspense>`.

### 2. `prisma/seed.ts` + script `seed`

`package.json` sudah punya `"seed": "tsx prisma/seed.ts"`. Data ter-seed:
8 item, 2 movement, 3 kategori, 4 merek, 3 lokasi, 2 supplier.
Total nilai inventaris terhitung **Rp 33.850.000**.

### 3. Smoke test HTTP (`smoke.ps1` di root project)

Skrip verifikasi runtime memakai `System.Net.HttpWebRequest`
(`AllowAutoRedirect = $false`) + token sesi HMAC-SHA256 yang dibuat manual.

Cara pakai (server harus jalan dulu):

```powershell
npm run build
npm run start -- -p 3100      # terminal terpisah
powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke.ps1 *> smoke.log
Get-Content smoke.log
```

Skrip `exit 1` kalau ada pemeriksaan gagal.

## Hasil verifikasi terakhir

Tanpa cookie → proxy mengalihkan dengan benar:

| Request | Status | Location |
| --- | --- | --- |
| `GET /` | 307 | `/login` |
| `GET /items` | 307 | `/login?next=%2Fitems` |
| `GET /api/export` | 307 | `/login?next=%2Fapi%2Fexport` |
| `GET /login` | 200 | — |

Login sungguhan lewat POST form server action (progressive enhancement, jadi bisa
ditiru tanpa browser):

| Request | Status | Hasil |
| --- | --- | --- |
| `POST /login` password benar | 303 | `Location: /`, `Set-Cookie: inventory_session=…` |
| `POST /login` password salah | 200 | pesan `Password salah. Coba lagi.`, tanpa cookie |

Cookie dari login itu lalu dipakai membuka `/` → 200 dengan angka dashboard utuh.

Dengan cookie `inventory_session=<issuedAt>.<hmac>` → semua 200:
`/`, `/items`, `/items?q=asus&status=AVAILABLE&sort=name_asc&page=1`,
`/items?page=1&sort=price_desc`, `/items/new`, `/items/[id]`, `/items/[id]/edit`,
`/items/[id]/label`, `/items?branchId=<id>`, `/items?acquisitionSource=BRANCH`,
`/items?acquisitionSource=HEAD_OFFICE`, `/movements`, `/master`, `/api/export`.

Konten yang sudah dipastikan ada:
- Dashboard: `Jenis barang`, `Nilai aset aktif` (Rp 100.350.000), hint
  `nilai perolehan` (Rp 112.600.000), `Pelepasan aset` (`1.850.000` dibuang,
  `10.400.000` dijual, `3.500.000` hasil penjualan), `Nilai aset aktif per cabang`
  (`3 cabang terdaftar`, `Kantor pusat`, `Cabang Bandung`, `Cabang Surabaya`),
  `Barang terbaru`, `Garansi segera habis`, `INV-2026-0008`, `33.850.000`
  **tidak** ada.
- `/items`: `<table`, `INV-2026-0001`, `Lokasi / cabang`, `Cabang lokasi`,
  `Gudang Bandung`, `Kantor Pusat`.
- Filter `?q=asus`: memuat `Router Asus RT-AX58U`, **tidak** memuat `Latitude 5440`.
- Filter `?q=bandung`: memuat `INV-2026-0006` (nama cabang ada di `searchKey`),
  tidak memuat `INV-2026-0001`; `?q=tidak ekonomis` memuat `INV-2026-0008`
  (alasan pembuangan juga ikut terindeks).
- Filter `?branchId=<Bandung>`: memuat `INV-2026-0005`, tidak memuat
  `INV-2026-0001`; filter `?acquisitionSource=BRANCH` hanya memuat `INV-2026-0006`.
- `/items/new`: `Tambah Barang`.
- `/items/[id]`: `Data barang`, `Riwayat pergerakan`, `Sumber perolehan`,
  `Pemilik aset`; untuk barang `SOLD`: `Barang ini sudah`,
  `tidak dihitung dalam nilai aset aktif`, `Tanggal jual`, `Harga jual`.
- `/items/[id]/edit`: `Edit Barang`.
- `/items/terhapus` (Sampah): `Sampah`, `Pulihkan`, `Status terakhir`, `Dibuang`,
  `INV-2026-0010`, `Lemari Arsip Besi Lion`; setelah barang terakhir dipulihkan →
  empty state `Sampah kosong`.
- `/items/[id]` barang terhapus: `Barang ini sudah dihapus`, `Pulihkan`,
  `Alasan dibuang`, `Rusak berat`; **tanpa** `Catat pergerakan` dan tanpa link
  `/items/<id>/edit`. Catatan penting: teks alert harus dicari dengan awalan
  `Barang ini sudah dihapus`, **bukan** `sudah dihapus dari daftar aktif` —
  kalimat halaman not-found bawaan Next.js selalu ikut ter-embed di payload RSC
  rute ini, jadi potongan pendek itu selalu "ketemu" dan pemeriksaannya palsu.
- `/movements`: `Riwayat pergerakan terbaru`, `catatan terakhir`, `Gudang A`.
- `/master`: `MasterManager`, `Unit kerja pemilik aset`, `Kode cabang`,
  `Cabang Bandung (BDG)`.
- `/api/export`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  (`inventaris-<YYYY-MM-DD>.xlsx`, arsip ZIP berawalan `PK`), sheet `Ringkasan`
  berisi baris TOTAL + catatan, lalu sheet `2026`; kolom memuat `Unit Pengelola`,
  `Cabang Lokasi`, `Sumber Perolehan`, `Cabang Pembeli`, `Pemilik Aset`,
  `Tanggal Dibuang`, `Alasan Dibuang`, `Tanggal Jual`, `Harga Jual`, dan
  `styles.xml` memuat `"Rp"#,##0` serta `dd/mm/yyyy`.

Catatan: token HMAC di `smoke.ps1` memakai secret literal
`dev-only-insecure-secret-change-me`. **Kalau `SESSION_SECRET` di
`.env` diubah, ubah juga konstanta `$secret` di skrip itu.** Sebaliknya,
`APP_PASSWORD` **tidak** di-hardcode: blok login POST membacanya dari `.env`
(fallback `admin`).

Dua jebakan PowerShell yang sempat bikin `smoke.ps1` gagal:

- `"..." -f $a, $b` di dalam daftar argumen method (`[Console]::WriteLine(...)`)
  salah di-parse — koma dibaca sebagai pemisah argumen method, sehingga `-f`
  hanya menerima satu nilai dan muncul `Error formatting a string: Index (zero
  based)`. Simpan dulu ke variabel, baru `[Console]::WriteLine($line)`.
- **`HttpClient` + header `Cookie` manual = request anonim.** Untuk mengirim
  server action sebagai POST multipart, `HttpClient` membuang header `Cookie`
  yang dipasang manual (dan `MultipartFormDataContent`-nya cuma ada setelah
  `Add-Type -AssemblyName System.Net.Http`), sehingga proxy mengalihkan request
  ke `/login` dengan 307. Pola yang dipakai sekarang: susun body multipart
  manual (`New-Object System.Text.StringBuilder` + boundary acak) lalu kirim
  lewat `System.Net.HttpWebRequest` — sama seperti helper `Hit()`/`Submit-Login`
  yang sudah terbukti bekerja.
- Form server action **bisa** ditiru tanpa browser: React menaruh id aksi dan
  state awalnya sebagai `<input type="hidden" name="$ACTION_*">` di dalam
  `<form>`. Cukup ambil semua hidden input dari `<form>` yang memuat teks
  tombol yang dituju (di halaman Sampah ada tombol Pulihkan **dan** di halaman
  detail ada tombol Hapus, jadi pemilihan form dilakukan lewat teks tombol +
  potongan id).

## Perbaikan susulan 9 Oktober 2026 — `new Date()` di `/items/[id]`

Gejala: dev overlay menampilkan **"Blocking Route Server — Next.js encountered
the unstable value `new Date()` while prerendering"** saat membuka halaman
detail barang. Di `dev.err.log` tercatat berulang:

```
Error: Route "/items/[id]": Next.js encountered the unstable value `new Date()` while prerendering.
    at daysUntil (src/lib/format.ts:68:48)
    at ItemDetail (src/app/(app)/items/[id]/page.tsx:71:33)
```

Penyebab: `ItemDetail()` memanggil `daysUntil(item.warrantyUntil)` untuk badge
"Garansi N hari lagi". Akarnya sama dengan kasus dashboard di sesi sebelumnya,
tetapi perbaikannya dulu **hanya** dipasang di `src/app/(app)/page.tsx`, jadi bug
yang sama masih hidup di halaman detail.

Yang penting dipahami: `next build` **tetap exit 0** dan `/items/[id]` tetap
tampil `◐`. Tanpa `generateStaticParams`, build hanya membuat shell fallback,
sehingga `ItemDetail` tidak pernah dijalankan. Validasi per-URL baru terjadi
**di dev**, saat rute pertama kali dikompilasi. Jadi error ini tidak akan
ketahuan dari build — hanya dari `dev.err.log` dan overlay dev.

Perbaikan: `import { connection } from "next/server";` + `await connection();`
sebagai baris pertama `ItemDetail()`, persis pola `DashboardContent()`.

```ts
async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // render saat request, bukan saat prerender
  const { id } = await params;
  ...
}
```

Bukti A/B (`.next` dihapus dulu supaya validasi prerender benar-benar jalan):

| Kondisi | `connection()` | `dev.err.log` setelah buka `/items/[id]` |
| --- | --- | --- |
| Sebelum | tidak ada | 4× error |
| A — dev bersih | dicabut | **2× error** |
| B — dev bersih | ada | **0 error** |

Di kondisi B halaman tetap utuh: status 200 dan badge ter-render
(`Garansi ,45, hari lagi` untuk `INV-2026-0001`). React memecah teks jadi
`Garansi <!-- -->45<!-- --> hari lagi`, jadi jangan mencari string mentah
`Garansi 45 hari lagi` di HTML — akan selalu tidak ketemu.

Catatan: HMR **tidak cukup** untuk menguji ulang hal ini. Setelah rute sudah
dikompilasi dalam satu sesi dev, shell-nya tidak divalidasi lagi — percobaan A/B
pertama sempat salah karena itu. Harus hapus `.next` lalu restart `next dev`.

Hasil verifikasi ulang setelah perbaikan: `npm run lint` exit 0,
`npx tsc --noEmit` exit 0, `npm run build` exit 0 (12/12, tabel rute tidak
berubah), dan `smoke.ps1` **117 pemeriksaan, 0 gagal** (`exit 0`).

## TODO besok — status per sesi lanjutan (9 Oktober 2026)

1. ✅ **SELESAI — ternyata bukan bug.** `/items/[id]` untuk id yang tidak ada
   mengembalikan **HTTP 200 adalah perilaku resmi Next.js**. Sudah dibuktikan
   lewat probe HTTP ke server produksi: body memuat UI 404 dan
   `<meta name="robots" content="noindex">`, sementara konten asli
   (`Data barang`, `Riwayat pergerakan`) **tidak** dirender. Dokumentasi lokal:
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md:15`
   ("Before streaming starts, Next.js returns a `404` status code. After
   streaming starts, the status code remains `200`") dan
   `.../file-conventions/loading.md:101` (Status codes).
   Penyebab: `notFound()` dipanggil di dalam `<Suspense>`, jadi shell sudah
   ter-stream dan status sudah terkunci.
   Tindakan: dibuat `src/app/(app)/items/[id]/not-found.tsx` +
   `src/app/not-found.tsx` supaya UI 404-nya konsisten dengan tema aplikasi
   (sebelumnya memakai halaman 404 default bawaan Next.js).
2. ✅ **SELESAI.** Pemeriksaan `/items?q=zzzznothing`, `/items?status=LOST`, dan
   `/items?page=999` sudah masuk `smoke.ps1` — semuanya 200 dan menampilkan
   empty state `Belum ada barang yang cocok`.
3. ✅ **SELESAI.** `smoke.ps1` sudah didokumentasikan di `README.md`.
4. ✅ **SELESAI — halaman Sampah & pemulihan (Paket 3).** Barang terhapus kini
   punya daftar sendiri di `/items/terhapus`, `getItem()` tidak lagi menyaring
   `deletedAt`, `restoreItemAction` mengembalikan status ke `AVAILABLE` sambil
   menulis jejak audit, dan bagian **SAMPAH** di `smoke.ps1` menguji alur
   hapus → pulih → hapus lagi. Rinciannya di bagian "Paket 3" di atas.
5. ✅ **SELESAI — kode barang otomatis + QR & label cetak (Paket 4).** Kolom Kode
   boleh dikosongkan (server menerbitkan `INV-<tahun>-<urut>-<jenis>`), ada field
   **Jenis barang** (`Item.assetType` dengan label manusiawi), dan setiap barang
   punya halaman label cetak ber-QR di `/items/[id]/label`. Rinciannya di bagian
   "Paket 4" di atas. Yang **belum** dikerjakan: mencetak **banyak label
   sekaligus** (mis. dari hasil filter `/items` — perlu rute
   `/items/labels?<filter>` berisi grid label) dan penanda jenis barang di ikon
   daftar/dashboard.

### Sisa ide (belum dikerjakan)

- Kalau butuh status HTTP 404 **asli** (SEO/analytics/compliance), lakukan cek
  existence di `src/proxy.ts` lalu `rewrite` ke rute not-found atau balikan
  respons 404. Di Next.js 16 Proxy **default Node.js runtime** (`proxy.md:255`,
  `proxy.md:806`), jadi Prisma bisa diakses di sana. Dokumentasi menyarankan
  pendekatan ini di `loading.md:113`, tapi hati-hati: *"Keep Proxy checks fast,
  and avoid fetching full content there"* → menambah 1 query DB per request
  halaman detail.
- Repo ini belum di-`git init` (`.gitignore` sudah ada).
- ✅ **SELESAI — multi-cabang (Paket 2).** Model `Branch` + `Location.branchId`
  sudah ada, plus dimensi perolehan/kepemilikan di `Item`. Ringkasnya:
  - `Item.acquisitionSource` + `sourceBranchId` = **siapa yang membeli**;
    `Item.ownerBranchId` = **pemilik aset** (`null` = Kantor pusat).
  - Cabang **lokasi** tetap lewat `Location.branchId` — jangan taruh `branchId`
    langsung di `Item`, itu dobel dengan `locationId` dan info ruangan hilang.
  - Filter `/items?branchId=` memakai cabang **lokasi**, sedangkan kartu
    "Nilai aset aktif per cabang" di dashboard memakai **kepemilikan**
    (`ownerBranchId`). Dua pertanyaan berbeda, sengaja dipisah.
- ✅ **SELESAI — barang `DISPOSED` / `SOLD`.** Dashboard sekarang menampilkan
  "Nilai aset aktif" (tanpa keduanya) berdampingan dengan "nilai perolehan",
  dan kartu "Pelepasan aset" untuk dibuang/dijual/hasil penjualan.
  Status non-aktif didefinisikan sekali di `INACTIVE_STATUSES`
  (`src/lib/constants.ts`). Ide berikutnya yang belum dikerjakan: penyusutan
  (depresiasi) dan laporan "hasil penjualan vs nilai buku".
- Artefak sisa yang boleh dihapus: `smoke-dash.html`, `smoke-items.html`,
  `smoke-export.csv`, `smoke.log`, `server.log`, `start.log`, `start.err.log`,
  `tsconfig.tsbuildinfo`.

### Kandidat paket berikutnya (belum dipilih)

- **Ekspor CSV mengikuti filter.** `/api/export` saat ini selalu mengeluarkan
  seluruh dataset; meneruskan `searchParams` dari `/items` (q, status, kategori,
  merek, lokasi, cabang, sumber, sort) akan membuat tombol ekspor konsisten
  dengan apa yang dilihat pengguna.
- **`/movements` berpaginasi + filter** (per barang, rentang tanggal, jenis
  perubahan) — sekarang hanya "N catatan terakhir" tanpa kontrol apa pun.
- ✅ **SELESAI (belum di-commit) — `error.tsx` / `global-error.tsx`.** Tiga
  boundary sudah ada: `src/app/error.tsx` (segmen akar, termasuk `/login`),
  `src/app/(app)/error.tsx` (di dalam rangka aplikasi supaya navbar tidak ikut
  hilang), dan `src/app/global-error.tsx` (menyediakan `<html>`/`<body>` sendiri
  plus inline style, karena `globals.css` diimpor oleh layout yang sedang
  gagal). Isi bersamanya di `src/components/ui/error-fallback.tsx` dan memakai
  prop `retry` — stabil sejak Next **16.3.0**
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:331`),
  sedangkan versi terpasang 16.4.0. Catatan: ketiganya **belum** diuji
  `smoke.ps1` (butuh cara memicu kegagalan render secara terkendali).
- **Multi-user & peran.** Identitas pelaku masih literal: `movedBy: "admin"`
  (`src/lib/actions/items.ts:79`, `:142`, `:189`, `:241`, `:302`) dan
  `createdBy: "admin"` (`:67`; sisi seed memakai `"seed"`). Sebelum ada model
  `User`, kumpulkan dulu semuanya jadi satu konstanta supaya satu titik ubah.

## Temuan audit 15 Oktober 2026 — prioritas perbaikan

Hasil audit ulang **dari kode, bukan dari ingatan**, setelah Paket 4. Tier A
berisi bug nyata (dua di antaranya sudah dibuktikan langsung ke `dev.db`),
Tier B fitur yang belum ada, Tier C rekayasa/operasional. Hal yang sudah
tercatat di "Kandidat paket berikutnya" dan "Sisa ide" di atas sengaja hanya
**dirujuk**, tidak diulang.

> Nomor baris yang disebut di bawah (`master.ts:69`, `schema.prisma:128`, dst.)
> adalah posisi **saat audit**, sebelum Paket 5 #1 & #2 — setelah perbaikan,
> nomornya bergeser. Pakai nama fungsi/field-nya, bukan nomor barisnya.

> Status 19 Oktober 2026: **seluruh Tier A (butir 1–5) sudah selesai** — lihat
> "Paket 5 #1", "Paket 5 #2", "Paket 5 #3", "Paket 6", dan "Paket 7".

### Tier A — bug nyata

1. **`searchKey` basi setelah rename data master (TERBUKTI).**
   `searchKey` adalah snapshot teks yang ikut memuat **nama relasi**
   (`src/lib/action-utils.ts:46-54`, dibangun `buildItemSearchKey` saat barang
   disimpan), tetapi `src/lib/actions/master.ts` **tidak pernah** memanggil
   `prisma.item.updateMany`: semua `save*Action` hanya `updateTag(...)`
   (baris 26-29).
   Bukti live: kategori `Elektronik` di-rename ke `Elektronik-ZZ` (meniru
   `saveCategoryAction`). Dari 7 barang berkategori itu, `searchKey`
   **semuanya masih memuat `elektronik`** dan **tidak satu pun memuat
   `elektronik-zz`** → `/items?q=elektronik-zz` kosong, sementara
   `?q=elektronik` masih menemukan barang yang kategorinya sudah berganti nama.
   Perbaikan: saat menyimpan master dan `name` berubah, hitung ulang
   `searchKey` barang terkait (pakai `buildItemSearchKey`) lalu
   `updateTag(CACHE_TAGS.items)`.
   > ✅ **SELESAI 15 Oktober 2026** — lihat "Paket 5 #1" di bawah. Perbaikan
   > akhirnya memakai `refreshItemSearchKeys()` (hitung dari **baris database**),
   > bukan `buildItemSearchKey()` yang hanya menerima input form.
2. **Hapus data master tanpa penjagaan → referensi jadi `null` diam-diam.**
   Enam aksi hapus langsung `prisma.*.delete`: `deleteBranchAction`
   (`master.ts:69`), `deleteDepartmentAction` (`:128`),
   `deleteCategoryAction` (`:184`), `deleteBrandAction` (`:236`),
   `deleteLocationAction` (`:295`), `deleteSupplierAction` (`:354`). Semua
   relasi master memakai `onDelete: SetNull`
   (`schema.prisma:128,189,191,193,195,200,206,209`), jadi menghapus satu
   kategori membuat `categoryId` 7 barang menjadi `null` **tanpa error** →
   `describeError()` tidak pernah jalan dan pengguna tidak diberi tahu apa pun.
   Berlipat dengan temuan (1): `searchKey` barang masih memuat nama kategori
   yang sudah lenyap. Untuk lokasi, `ItemMovement.fromLocationId` /
   `toLocationId` (`:254-255`) ikut `null` → **jejak audit kehilangan lokasi**.
   Perbaikan: hitung pemakaian (`prisma.item.count`) sebelum hapus, tolak
   dengan pesan "masih dipakai oleh N barang", atau minta konfirmasi eksplisit
   + rapikan `searchKey` sesudahnya.
   > ✅ **SELESAI 15–16 Oktober 2026** — lihat "Paket 5 #2" di bawah. Opsi yang
   > dipilih: **tolak penghapusan** sambil menampilkan jumlah pemakaian. Karena
   > baris yang masih dirujuk tidak pernah terhapus, `searchKey` tidak mungkin
   > basi dari jalur ini, jadi `refreshItemSearchKeysByIds()` **tidak** dipakai
   > `delete*Action` (hanya jalur pindah lokasi).
3. **Rahasia punya fallback hardcoded.** `src/lib/session.ts:15`
   (`SESSION_SECRET ?? "dev-only-insecure-secret-change-me"`) dan `:67`
   (`APP_PASSWORD ?? "admin"`). Bila `.env` tidak terpasang di server produksi,
   penanda tangan cookie sesi memakai nilai yang ada di repo → siapa pun yang
   bisa membaca repo dapat **memalsukan cookie sesi**, dan password login
   menjadi `admin`. Perbaikan: gagal-cepat (`throw`) saat
   `NODE_ENV === "production"` dan env kosong/terlalu pendek.
   > ✅ **SELESAI 19 Oktober 2026** — lihat "Paket 6" di atas. Yang ditolak di
   > produksi: env kosong, placeholder repo, `SESSION_SECRET` < 32 karakter, dan
   > `APP_PASSWORD` yang ada di daftar password contoh repo.
4. **Login tanpa pembatasan percobaan.** `src/lib/actions/auth.ts:28` hanya
   membandingkan password; satu password dipakai bersama, tanpa throttle atau
   lockout → brute force leluasa. Perbaikan: hitung percobaan gagal per IP per
   jendela waktu, balas lambat atau kunci sementara.
   > ✅ **SELESAI 19 Oktober 2026** — lihat "Paket 7" di atas. 5 kegagalan per IP
   > → kunci 15 menit (password benar pun ditolak), status in-memory per proses.
5. ✅ **SELESAI (Paket 5 #3).** ~~**`Item.photoUrl` praktis mati.** Field,
   validasi, dan input teks ada (`src/components/items/item-form.tsx`), tetapi
   nilainya tidak dirender di mana pun lagi: bukan di `/items/[id]`, bukan di
   tabel daftar, bukan di ekspor; tidak ada unggah berkas.~~ Kolom itu kini
   **hidup**: diisi hanya lewat unggahan (nama berkas dibuat server, disimpan di
   `uploads/items`, disajikan `/api/photos/<uuid>.<ext>` ber-sesi), tampil di
   halaman detail + thumbnail daftar, dan bisa diganti/dihapus dari form barang
   maupun halaman detail. Satu foto utama per barang; mengetik URL bebas sengaja
   dihapus supaya sumbernya cuma satu.

### Tier B — fitur bernilai harian

- ✅ **SELESAI (Paket 8)** — ~~**Import `.xlsx`.**~~ Halaman `/items/import`
  menerima berkas berkolom ekspor, laporan per baris, kode duplikat ditolak.
- ✅ **SELESAI (Paket 11)** — label massal di `/items/labels` (ikut filter).
- ✅ **SELESAI (Paket 9)** — ekspor mengikuti filter.
- ✅ **SELESAI (Paket 10)** — `/movements` paginasi + filter.
- ✅ **SELESAI (Paket 12)** — stock opname di `/opname` (snapshot stok, hitung
  per baris, tutup → selisih diterapkan + pergerakan).
- ✅ **SELESAI (Paket 7)** — penyusutan garis lurus + laporan nilai buku di
  `/laporan/nilai-buku` (umur ekonomis per kategori, laba/rugi pelepasan).
- **Multi-user & peran** → rujuk "Kandidat paket berikutnya".

### Tier C — rekayasa & operasional

- ✅ **SELESAI (Paket 8)** — Vitest + `npm test` untuk fungsi murni.
  ~~**Belum ada unit test.**~~ `smoke.ps1` bagus tetapi butuh server hidup + seed
  dan hanya menguji HTTP; fungsi murni (`itemCodeYear`, `format*`,
  `buildInventoryWorkbook`) layak diuji Vitest + skrip `npm test`.
- ✅ **SELESAI (Paket 8)** — `.github/workflows/verify.yml` (tsc → lint → test →
  build → seed → smoke di windows-latest). ~~**Belum ada CI.**~~ Perlu alur `tsc --noEmit` → `eslint` → `build` →
  `smoke.ps1` (dengan `npm run seed`) supaya regresi seperti
  `runtime = "nodejs"` tidak terulang tanpa terasa.
- ✅ **SELESAI (Paket 13)** — arah deploy diputuskan: **VPS + Docker, SQLite
  tetap**; artefak standalone, compose, backup, dan prosedur restore sudah ada.
- ✅ **SELESAI (Paket 13)** — `scripts/backup-db.mjs` (`VACUUM INTO` +
  `integrity_check` + rotasi) dan `scripts/restore-db.md`.
- **Pekerjaan sesi ini sudah di-commit** bersama paket yang masih tertahan
  (ekspor `.xlsx`, error boundary berlapis, `scripts/rebuild-search-keys.ts`,
  Paket 5 #1 & #2). `scripts/` kini hanya berisi `rebuild-search-keys.ts` — semua
  `tmp-*.ts` / `tmp-*.ps1` sudah dihapus, dan `dev-server*.log` / `prod-*.log` /
  `/scripts/tmp-*` masuk `.gitignore` supaya artefak sesi lokal tidak ikut
  terbawa. (Hash tidak dicatat di sini supaya tidak basi saat commit di-amend —
  lihat `git log`.)

### Urutan yang disarankan

1. ✅ **Tier A tuntas** — butir 1 & 2 (Paket 5 #1–#2), butir 5 (Paket 5 #3),
   butir 3 (Paket 6), butir 4 (Paket 7). **Berikutnya: Tier B — import `.xlsx`.**
2. Tier B: ✅ import Excel (Paket 8), ✅ ekspor ikut filter (Paket 9),
   ✅ `/movements` filter+paginasi (Paket 10), ✅ label massal (Paket 11),
   ✅ stock opname (Paket 12), ✅ penyusutan / laporan nilai buku (Paket 7).
3. Tier C: ✅ unit test + CI (Paket 8). Berikutnya: **target DB produksi**
   (VPS/Docker) → backup terjadwal.

## Paket 5 #1 — `searchKey` tidak lagi basi (sesi 15 Oktober 2026)

Menutup Tier A #1 dari audit di atas. `searchKey` adalah *snapshot teks* yang
ikut memuat **nama relasi**, jadi setiap perubahan nama/kode data master — dan
setiap perpindahan barang ke lokasi lain — meninggalkan teks lama di kunci
pencarian: `?q=` masih menemukan barang lewat nama yang sudah tidak dipakai,
dan **gagal** menemukannya lewat nama yang baru.

### Akar masalah

`buildItemSearchKey()` hanya dipanggil saat barang disimpan, sedangkan
`src/lib/actions/master.ts` tidak pernah menyentuh `Item` sama sekali — keenam
`save*Action` hanya memanggil `updateTag(...)`. Bug kelas yang sama juga ada di
`createMovementAction`: memindahkan barang mengubah nama lokasi di `searchKey`,
tetapi kuncinya tidak dihitung ulang.

### Perbaikan

- `src/lib/action-utils.ts`
  - `ItemSearchKeyFields` + `composeItemSearchKey()` — satu tempat yang memegang
    **urutan kanonik** field `searchKey`. `buildItemSearchKey()` (jalur input
    form) kini mendelegasikan ke sini, jadi urutannya tidak digandakan di dua
    tempat dan kunci bisa dihitung dari **baris database**, bukan hanya dari
    form.
  - `SEARCH_KEY_RELATION_SELECT` — relasi yang namanya ikut tersimpan di kunci.
  - `refreshItemSearchKeys(where)` → jumlah barang yang diperbarui;
    `refreshItemSearchKeysByIds(ids)` → versi untuk id yang sudah dikumpulkan
    (dipakai sesudah baris master dihapus, lihat catatan di bawah). Keduanya
    menulis dalam satu `$transaction`.
- `src/lib/actions/master.ts` — keenam `save*Action` kini `findUniqueOrThrow`
  baris sebelumnya dan **hanya** memanggil `refreshItemSearchKeys()` bila field
  yang relevan benar-benar berubah: cabang (`name`/`code`; dicocokkan lewat
  `sourceBranchId`, `ownerBranchId`, dan `location.is.branchId`), unit pengelola
  (`name`/`code`), kategori (`name`), merek (`name`), lokasi (`name` atau
  `branchId`), supplier (`name`). Kalau tidak ada yang berubah, tidak ada tulis
  tambahan sama sekali.
- `src/lib/actions/items.ts` — `createMovementAction` memanggil
  `refreshItemSearchKeysByIds([itemId])` setelah transaksi bila
  `nextLocationId !== item.locationId`.
- `scripts/rebuild-search-keys.ts` + `npm run rebuild-search-keys` — backfill
  idempoten untuk database lama (`refreshItemSearchKeys({})`). Barang yang
  kuncinya sudah basi tidak akan pernah tertolong oleh perbaikan di atas, jadi
  jalur ini perlu ada.

### Bukti (dijalankan langsung, bukan dari ingatan)

- `npx tsc --noEmit`, `npm run lint`, dan `npm run build` hijau.
- Backfill: perbandingan kunci tersimpan vs. hasil hitung ulang **selisih 0**;
  satu-satunya delta yang muncul adalah token kode unit pengelola yang memang
  tidak diisi seed (`it`/`ga`).
- **Rename:** kategori `Elektronik` → `Elektronik-ZZ` lewat POST asli ke
  `/master` (multipart, tanpa JavaScript). Ketujuh barang berkategori itu
  kuncinya berubah memuat `elektronik-zz`, dan `/items?q=elektronik-zz`
  mengembalikan hasil — sebelumnya kosong. Nama dikembalikan, selisih kembali 0,
  tidak ada sisa `elektronik-zz`. Diulang juga di server produksi (port 3100).
- **Pindah lokasi:** `INV-2026-0002-MON` dipindah `Gudang A` → `Ruang Meeting`.
  Kuncinya kehilangan `gudang a` dan mendapat `ruang meeting`;
  `/items?q=ruang%20meeting` menemukannya, `?q=gudang%20a` tidak. Dipindahkan
  kembali dan movement ujinya dihapus — DB kembali `items=10, aktif=9`,
  `movements=29`. Angka pergerakan naik **2 setiap kali `smoke.ps1` dijalankan**
  (dua baris audit hapus/pulih), jadi di akhir sesi ini nilainya 37 — itu wajar,
  bukan sisa data uji.
- **Smoke penuh:** `npm run build` → `npm run start -- -p 3100` → `smoke.ps1`
  → **205 pemeriksaan, 0 gagal**, `exit 0`.

### Catatan penting

- Hapus data master **tidak** memakai `refreshItemSearchKeysByIds()`: sejak
  Paket 5 #2 penghapusan ditolak selama barisnya masih dipakai, jadi tidak ada
  barang yang perlu dirapikan sesudah hapus. Helper `ByIds` tetap dipakai jalur
  pindah lokasi (`createMovementAction`).

## Paket 5 #2 — hapus data master ditolak bila masih dipakai (sesi 15–16 Oktober 2026)

Menutup Tier A #2 dari audit di atas. Keenam `delete*Action` di
`src/lib/actions/master.ts` sebelumnya langsung memanggil `prisma.*.delete`.
Semua relasi master memakai `onDelete: SetNull` (`schema.prisma`), jadi
penghapusan **selalu berhasil** dan yang terjadi adalah kehilangan referensi
secara diam-diam: `describeError()` tidak pernah jalan dan pengguna tidak
menerima pesan apa pun.

### Keputusan produk

Audit menyediakan dua opsi: (a) tolak penghapusan sambil menampilkan jumlah
pemakaian, atau (b) minta konfirmasi eksplisit lalu rapikan `searchKey`
sesudahnya. Yang dipilih **(a) tolak**. Alasannya: jumlah pemakaian mudah
dihitung dan bisa ditampilkan apa adanya, sedangkan opsi (b) membuat satu tombol
"Hapus" punya dua arti berbeda tergantung konfirmasi — di jalur tanpa JavaScript
(yang justru diuji smoke) perbedaan itu tidak bisa dibedakan. Konsekuensi
penting: `searchKey` **tidak mungkin** basi dari jalur ini, karena baris yang
masih dirujuk tidak pernah terhapus.

### Perbaikan

- `src/lib/actions/master.ts`
  - `describeMasterUsage(subject, usage)` — satu tempat yang menyusun pesan
    penolakan (`Kategori ini masih dipakai oleh 7 barang. Pindahkan atau ganti
    referensinya dulu sebelum menghapus.`); mengembalikan `null` bila tidak ada
    pemakaian. Bagian yang bernilai nol tidak ikut dicetak, dan nasihatnya
    berbeda untuk lokasi yang muncul di riwayat pergerakan (`Riwayat pergerakan
    tidak boleh kehilangan lokasi.`).
  - Tiap `delete*Action` menghitung pemakaian **dan** menghapus di dalam satu
    `prisma.$transaction`, supaya tidak ada celah antara "masih kosong" dan
    "benar-benar dihapus". Pemakaian yang dihitung: cabang (`sourceBranchId`,
    `ownerBranchId`, atau `location.branchId` miliknya — plus jumlah lokasinya),
    unit pengelola / kategori / merek / supplier (`item.count`), lokasi
    (`item.count` + `itemMovement.count` pada `fromLocationId`/`toLocationId`).
  - Bila ditolak, action mengembalikan `{ ok: false, message }` **sebelum**
    `invalidateMasterCaches()` dipanggil, jadi tidak ada cache yang dibuang untuk
    penghapusan yang tidak terjadi.
- `src/components/master/master-manager.tsx` — pesan penolakan tampil sebagai
  `<Alert tone="error">` (`role="alert"`) di baris yang gagal, bukan toast atau
  console: pengguna melihat **baris mana** yang ditolak dan berapa pemakaiannya.

### Bukti (dijalankan langsung, bukan dari ingatan)

- `npx tsc --noEmit`, `npm run lint`, `npm run build` hijau.
- **E2E langsung ke `dev.db` + HTTP** (build produksi port 3100, multipart form
  server action tanpa JavaScript): **20 baris master yang terpakai** di data seed
  di-POST ke form Hapus-nya dan semuanya ditolak dengan pesan **persis** sesuai
  hitungan, mis. `Elektronik` → `Kategori ini masih dipakai oleh 7 barang.`,
  `Gudang A` → `Lokasi ini masih dipakai oleh 5 barang, 36 pergerakan. Riwayat
  pergerakan tidak boleh kehilangan lokasi.`, `Kantor Pusat` → `Cabang ini masih
  dipakai oleh 7 barang, 3 lokasi.`, `Gudang Bandung` → `Lokasi ini masih dipakai
  oleh 2 barang.` (tanpa "pergerakan", karena riwayatnya kosong). Angka-angka itu
  dari run 15–16 Oktober 2026; jumlah `pergerakan` bertambah 2 setiap kali smoke
  dijalankan, jadi pesan lokasi bisa berbunyi angka lain — yang penting polanya
  cocok. Tiap baris juga diperiksa: pesannya terbaca sebagai `role="alert"` dan
  barisnya **masih ada** sesudahnya. Snapshot DB (jumlah baris + seluruh
  `searchKey`) **identik sebelum vs. sesudah** seluruh percobaan.
- Jalur sukses: kategori sementara dibuat → langsung bisa dihapus; cabang
  sementara yang ditunjuk satu lokasi sementara → ditolak (`1 lokasi`) → setelah
  lokasinya dihapus, cabangnya bisa dihapus. DB kembali seperti semula.
- **Penjagaan permanen di `smoke.ps1`** — bagian *hapus data master*, 31
  pemeriksaan baru: tiga baris seed (`Elektronik`, `Gudang A`, `Kantor Pusat`)
  di-POST hapus, lalu diperiksa jumlah pemakaiannya benar-benar tampil
  (`\d+ barang`, `\d+ barang, \d+ pergerakan`, `\d+ barang, \d+ lokasi`),
  teksnya terbaca (`role="alert"`), dan barisnya masih ada; sesudah itu jalur
  sukses (kategori `ZZ-Smoke-Kategori`) dan rujukan **tidak langsung** (cabang
  sementara ← lokasi sementara) dijalankan dan dibersihkan di bagian yang sama.
  Helper `Submit-Action` mendapat parameter opsional `$overrides` supaya skrip
  bisa mengisi field form data master yang terlihat (input teks/select) — form
  hapus tetap jalan tanpa itu karena field-nya `hidden`. Hasil saat itu: **236
  pemeriksaan, 0 gagal**, `exit 0` (kini **289** setelah bagian foto barang
  ditambahkan, Paket 5 #3, plus 4 pemeriksaan keterangan unggah).

### Catatan

- Rujukan **tidak langsung** ikut dihitung: cabang ditolak bukan hanya karena
  barang yang menunjuk langsung (`sourceBranchId`/`ownerBranchId`), tetapi juga
  karena lokasi miliknya — dan barang yang berada di lokasi itu. Tanpa itu,
  menghapus cabang tetap bisa menihilkan `location.branchId` diam-diam.

## Paket 5 #3 — Foto barang (sesi 16 Oktober 2026)

Tujuan: kolom `Item.photoUrl` yang selama ini mati (temuan Tier A #5) dibuat
benar-benar berfungsi — satu foto utama per barang, diunggah dari HP/komputer,
tampil di halaman detail & daftar, dan bisa diganti/dihapus.

### 1. Penyimpanan: berkas di disk, di luar `public/`

`src/lib/photos.ts` (baru) menangani seluruh siklus berkas:

- Berkas ditulis ke `uploads/items/` (dibuat otomatis) — **di luar `public/`**
  karena folder itu disajikan sebagai aset statis **tanpa** pemeriksaan sesi.
  Di-gitignore (`/uploads/`), jadi bukan bagian repo.
- `Item.photoUrl` menyimpan URL **relatif** (`/api/photos/<uuid>.jpg`), bukan
  path disk: tetap sah walau aplikasi pindah host/folder, dan tidak ada path
  server yang bocor ke HTML.
- Jenis gambar ditentukan dari **magic bytes** isi berkas (`sniffImageType`),
  bukan `File.type` kiriman klien: JPEG (`FF D8 FF`), PNG, GIF, WEBP. Akhiran
  berkas pun diambil dari hasil sniff, jadi isi disk selalu cocok dengan
  `Content-Type` yang dikirim ulang.
- Nama berkas = `randomUUID()` + ekstensi; nama kiriman klien tidak dipakai sama
  sekali (tidak ada `../`, tidak ada nama yang bisa ditabrak).
- `deleteUploadedPhoto()` hanya menyentuh berkas yang diawali `/api/photos/` dan
  namanya cocok pola UUID + ekstensi. Nilai dari luar (`https://…` sisa data
  lama) dibiarkan, jadi kolom itu tidak bisa dipakai menghapus berkas
  sembarangan.
- `discardPhoto()` membuang berkas yang sudah ditulis tetapi gagal dipakai (mis.
  penyimpanan database ditolak) supaya tidak menumpuk berkas yatim.

Batas ukuran **5 MB** (`PHOTO_MAX_BYTES` di `src/lib/constants.ts`, dipakai
bersama oleh form & server). Batas body Server Action bawaan Next.js hanya
**1 MB** sedangkan foto dari HP bisa 3–8 MB → `experimental.serverActions.
bodySizeLimit: "6mb"` di `next.config.ts`. Foto dari HP juga **dikecilkan di
browser** dulu (canvas → JPEG, sisi terpanjang 1600 px) oleh `photo-field.tsx`,
lalu berkas hasilnya dipasang kembali ke input asli lewat `DataTransfer` — jadi
form tetap terkirim sebagai form biasa, dan tanpa JavaScript pun berkas aslinya
yang dikirim (server yang menolak dengan pesan jelas).

### 2. Penyajian: `/api/photos/[name]` yang memeriksa sesi

`src/app/api/photos/[name]/route.ts` (baru) membaca berkas lalu membalasnya
dengan `Content-Type` dari ekstensi, `Cache-Control: private,
max-age=31536000, immutable` (nama berkas unik per unggahan, isinya tidak pernah
berubah), dan `X-Content-Type-Options: nosniff`.

> **Jebakan yang mudah terlewat:** matcher di `src/proxy.ts` melewatkan URL
> berakhiran ekstensi gambar (`*.jpg`, `*.png`, …) supaya aset statis tidak ikut
> dicek. Artinya permintaan ke `/api/photos/<uuid>.jpg` **tidak lewat proxy**,
> sehingga `isAuthenticated()` **wajib** dipanggil di dalam route handler —
> tanpa itu foto barang bisa dibaca siapa saja yang tahu URL-nya.

### 3. UI: kolom di form barang + kontrol di halaman detail

- `src/components/items/photo-field.tsx` (baru, klien): kolom **Foto barang** di
  form tambah/edit — input berkas, pratinjau, dan centang **Hapus foto yang
  tersimpan**. Menggantikan input teks "URL foto" yang lama.
- `src/components/items/item-photo.tsx` (baru, klien): kartu **Foto barang** di
  halaman detail dengan tombol Unggah/Ganti/Hapus, dan aksinya **hanya menyentuh
  `photoUrl`** — foto bisa diurus tanpa membuka (dan menyimpan ulang) seluruh data
  barang.
- Keterangan **"Foto barang berhasil diunggah."** (`PHOTO_UPLOADED_MESSAGE` di
  `src/lib/constants.ts`, dipakai klien & server) muncul di kartu itu: dari hasil
  aksi unggah langsung, atau sebagai **titipan URL** `?photo=uploaded` yang
  dibawa pengalihan form tambah/edit — pengalihan halaman tidak bisa membawa
  state, jadi penandanya ditulis di `redirect()` dan dibaca halaman detail
  (`firstParam`) lalu diteruskan sebagai prop `uploadedNotice`. Pesan hasil aksi
  **selalu menang** atas titipan itu, sehingga keterangan itu tidak tertinggal
  saat pengguna langsung menghapus fotonya.
- Halaman detail menampilkan fotonya (klik → buka ukuran penuh) atau empty state
  "Belum ada foto"; tabel daftar barang menampilkan thumbnail 40 px di kolom nama.

Aksi baru di `src/lib/actions/items.ts`: `uploadItemPhotoAction` &
`removeItemPhotoAction`. `createItemAction` / `updateItemAction` memakai helper
`resolvePhotoField()` dengan aturan satu arah: **berkas unggahan menang** → kalau
tidak ada berkas, centang hapus mengosongkan → kalau keduanya tidak ada, foto lama
**dipertahankan** (menyunting nama barang tidak boleh menghapus fotonya). Berkas
lama dibuang **setelah** database berhasil disimpan, dan dibuang lagi (`discard`)
bila penyimpanan gagal — supaya tidak ada berkas yatim.

### 4. Verifikasi

- `npx tsc --noEmit`, `npm run lint`, `npm run build` hijau (rute
  `/api/photos/[name]` muncul sebagai dynamic).
- **E2E HTTP ke build produksi** (multipart form server action tanpa JavaScript):
  unggah JPEG 160 byte → tersimpan sebagai `/api/photos/<uuid>.jpg`, tampil di
  detail + daftar + form edit; `GET` berkas itu **401 tanpa sesi** dan **200 +
  `image/jpeg`** dengan sesi, panjang byte-nya **sama**; `..%2F..%2Fdev.db` → 404;
  nama UUID palsu → 404; berkas `.txt` → "Berkas foto harus berupa gambar JPG,
  PNG, WEBP, atau GIF."; berkas 5,2 MB → "Ukuran foto maksimal 5 MB"; foto
  diganti lewat form edit → berkas lama 404; form edit disimpan ulang tanpa
  berkas → foto tetap; hapus foto → kolom kosong + berkas 404.
- Snapshot baris `INV-2026-0009-PC` (28 kolom, termasuk `searchKey`) **identik
  sebelum vs. sesudah** smoke dijalankan — jadi menyimpan ulang form edit tidak
  menghapus data apa pun.
- **Penjagaan permanen di `smoke.ps1`**: bagian *FOTO BARANG*, **49 pemeriksaan
  baru** (31 soal foto + 18 soal simpan-ulang form edit). Helper `Submit-Action`
  mendapat parameter `$file` (bagian berkas multipart dikirim sebagai byte mentah,
  bukan lewat `StringBuilder`), helper baru `Get-Binary` (membaca berkas biner
  tanpa mengubahnya jadi teks) dan `Get-ItemFormValues` (membaca nilai field form
  edit dari HTML-nya sendiri lalu mengirim ulang apa adanya; checkbox sengaja
  dilewati karena yang tidak dicentang memang tidak dikirim browser). Total saat
  itu: **285 pemeriksaan, 0 gagal**, `exit 0`.
- **Penjagaan permanen keterangan unggah** (lanjutan sesi yang sama, 4
  pemeriksaan baru → **289**): pesan `Foto barang berhasil diunggah.` harus
  muncul setelah unggah di kartu foto; pengalihan setelah form edit disimpan
  **dengan** berkas harus berbunyi `/items/<id>?photo=uploaded` dan halaman
  tujuan harus menampilkan pesan itu; sebaliknya simpan-ulang **tanpa** berkas
  tidak boleh menandai unggahan, dan halaman detail biasa tidak boleh memuat
  pesan itu (keterangan hanya muncul sebagai hasil aksi, bukan menempel terus).
  Karena bagian foto kini memilih sendiri barang yang belum punya foto dari
  daftar, bagian ini tetap jalan walau ada unggahan lewat UI di data dev (yang
  menjadikan barang pertama sudah berfoto — kondisi yang memang terjadi di sesi
  ini dan sempat membuat bagian foto gagal sebelum pemilihan itu dibuat).

### Catatan

- Foto **tidak** ikut ekspor Excel; ekspor tetap berisi kolom data barang.
- Soft delete barang **tidak** menghapus berkasnya (barangnya masih bisa
  dipulihkan). Berkas hanya dibuang saat foto diganti atau dihapus.
- `next/image` sengaja **tidak** dipakai: pengoptimal Next mengambil gambar dari
  server **tanpa cookie sesi**, jadi `/api/photos/...` akan dibalas 401 dan
  gambarnya rusak. Karena itu `<img>` dipakai langsung, dengan `eslint-disable`
  satu baris beralasan di tiga tempat.
- Format ukuran dipakai bersama: `describePhotoSize()` tinggal di
  `src/lib/constants.ts` (aman untuk klien) dan dipakai server
  (`photos.ts`, pesan penolakan) maupun klien (`photo-field.tsx`, catatan
  sebelum unggah) supaya angka yang disebut keduanya sama persis.

## Paket 6 — multi-user: akun, peran, dan jejak audit (sesi 21 Oktober 2026)

### Keputusan produk

- Login per **akun** (`username` + password), bukan lagi satu password bersama
  di `APP_PASSWORD`. Password disimpan sebagai hash **scrypt** (`src/lib/passwords.ts`),
  lengkap dengan salt; tidak ada jalur untuk membaca password lama, hanya
  menggantinya.
- Tiga peran, dari yang paling luas:
  - **ADMIN** — semua aksi, termasuk kelola akun (`/pengguna`) dan hapus data master.
  - **STAFF** — pekerjaan inventaris: tambah/edit barang, impor, perpindahan, opname.
  - **VIEWER** — hanya membaca; semua form tulis diganti penjelasan.
- **Tidak ada halaman pendaftaran.** Akun pertama dibuat dari terminal
  (`npm run user:create`), akun berikutnya dari `/pengguna` oleh admin. Ini
  disengaja: aplikasi ini dipakai satu organisasi, bukan pendaftaran publik.
- Jejak audit memakai `username` akun yang login (`createdBy`/`movedBy`), bukan
  nama yang diketik di form. Field "Dipindahkan oleh" jadi read-only.

### Yang berubah

| Bagian | Isi |
| --- | --- |
| `prisma/schema.prisma` | model `User` (`id`, `username` unik, `name`, `role`, `active`, `passwordHash`, `lastLoginAt`) + migrasi `add_users` |
| `src/lib/session.ts` | cookie berisi identitas bertanda tangan: `<b64url({u,n,r,t})>.<hmac>` |
| `src/lib/auth.ts` | `startSession(user)`, `getSession()` (baca ulang DB → akun nonaktif langsung kehilangan akses), `requireAuth/requireWrite/requireAdmin` |
| `src/lib/actions/auth.ts` | login per akun, pesan gagal seragam ("Username atau password salah"), throttle per IP tetap |
| `src/lib/actions/users.ts` | buat/ubah akun, ganti password, penjagaan "admin terakhir" |
| `src/app/(app)/pengguna` | halaman kelola akun (admin saja) |
| `scripts/create-user.ts` | bootstrap & pemulihan akun dari terminal (`--delete` untuk menghapus) |
| `smoke.ps1` | login nyata lewat POST form + bagian **PERAN & IZIN (RBAC)** |

### Penjagaan yang mudah terlupa (sudah ditulis di kode)

- **Admin terakhir** tidak bisa dinonaktifkan atau diturunkan perannya — kalau
  boleh, tidak ada lagi yang bisa membuka `/pengguna` dan aplikasi harus
  diselamatkan lewat SQL.
- Akun **tidak bisa menonaktifkan dirinya sendiri** lewat `/pengguna`.
- Akun nonaktif diperlakukan sama seperti password salah: pesannya tidak
  membocorkan bahwa username-nya ada, tapi kegagalannya tetap dihitung throttle.
- `requireWrite`/`requireAdmin` **mengalihkan** ke `/?denied=…` (bukan melempar
  error) supaya penolakan berakhir sebagai pesan yang terbaca di dashboard,
  bukan layar "Application error". Dashboard menampilkan alasannya.
- Menu `/pengguna` disembunyikan untuk non-admin, dan tombol kelola data master
  memakai `hidden` + `data-actions` (bukan dihapus dari markup) agar struktur
  baris identik antar peran. **Ini hanya UI** — penjagaan sesungguhnya ada di
  server action.

### Cara pakai

```bash
# akun pertama (atau reset password admin yang terkunci)
npm run user:create -- --username adam --name "Adam Saputra" --role ADMIN
# password: --password "..." (atau APP_PASSWORD dari .env, atau dibuat acak)

npm run user:create -- --username budi --name "Budi" --role STAFF --password "..."
npm run user:create -- --username smoke-x --delete      # hapus akun
```

Setelah upgrade ini **semua cookie lama tidak sah** (format token berubah), jadi
setiap pengguna perlu login sekali lagi.

### Bukti (dijalankan langsung, bukan dari ingatan)

- `npx tsc --noEmit` → 0, `npx eslint src scripts --max-warnings=0` → 0,
  `npm run build` → sukses (route `/pengguna` ikut terprerender sebagai PPR).
- `powershell -NoProfile -File ./smoke.ps1` terhadap `next start -p 3100`:
  **415 pemeriksaan, 0 gagal**, `exit 0`.
- Bagian RBAC yang baru (14 pemeriksaan) membuktikan: staff login dapat cookie,
  staff melihat `/pengguna` sebagai "hanya untuk admin" dan tanpa form tambah,
  menu Pengguna tidak muncul untuk staff tapi muncul untuk admin, staff tidak
  bisa menghapus data master lewat POST (dialihkan ke `/?denied=admin` dan
  datanya utuh), viewer tidak mendapat form tambah barang dan POST-nya
  dialihkan ke `/?denied=write`, sedangkan staff tetap boleh menulis.
- Akun uji (`smoke-staff`, `smoke-viewer`) dibuat dan dihapus lagi oleh smoke,
  jadi isi database setelah suite selesai kembali seperti semula.

### Catatan teknis

- **Jangan menandatangani cookie sendiri di skrip uji.** Cookie memuat identitas
  yang ditandatangani server; satu-satunya cara jujur mendapatkannya adalah
  `POST /login`. Smoke sekarang begitu (dulu membuat token HMAC manual).
- `npm run … -- --flag` **tidak** meneruskan argumen dengan benar dari
  PowerShell; di `smoke.ps1` skrip akun dipanggil lewat
  `npx --no-install tsx scripts/create-user.ts …`.
- `Get-MasterRowId` di smoke membaca `data-row-id` pada `<li>`, bukan input
  hidden di dalam form: React memecah isi baris yang punya `useActionState`
  menjadi potongan yang di-stream terpisah (`<template id="P:…">`), sehingga
  label dan form tidak selalu berada dalam satu chunk HTML.
- Redirect di dalam child yang di-`<Suspense>` **tidak** mengubah status HTTP
  (shell sudah 200). Untuk penolakan GET, tampilkan pemberitahuan di halaman,
  bukan `redirect()`.

## Paket 7 — penyusutan & laporan nilai buku (sesi 21 Oktober 2026)

### Keputusan

- **Garis lurus (straight-line) per bulan, tanpa nilai residu.** Inventaris kantor
  tidak punya residu yang bisa dipertanggungjawabkan, dan saldo menurun butuh tarif
  per kelompok aset yang lebih sulit dijelaskan ke keuangan. Dua parameter yang
  sudah ada (harga & tanggal perolehan) + satu opsional per kategori.
- **Umur ekonomis per kategori** (`Category.usefulLifeMonths`), bukan per barang:
  satu tempat ubah, dan barang baru langsung ikut aturan kategorinya. Kosong =
  `DEFAULT_USEFUL_LIFE_MONTHS` (48 bulan) di `src/lib/depreciation.ts`.
- **Per bulan penuh**, dibulatkan ke rupiah terdekat. Barang yang dibeli bulan ini
  masih bernilai penuh; barang yang umurnya melewati umur ekonomis bernilai 0.
  Dua perilaku ini sengaja dipilih karena bisa dicek manual tanpa alat bantu.
- **`price` adalah harga satuan**, jadi semua angka laporan dikalikan `quantity`.
  Sama seperti "Total nilai" di halaman detail dan kartu dashboard.
- **Barang yang sudah dilepas** dihitung sampai tanggal jual/buang, bukan hari ini
  — kalau tidak, laba/rugi pelepasan berubah setiap laporan dibuka.
- Laporan memisahkan dua pertanyaan: **nilai buku barang aktif** (`/laporan/nilai-buku`)
  dan **hasil pelepasan vs nilai buku** (jual → laba/rugi, buang → nilai yang
  dihapus dari pembukuan).

### Yang berubah

| Berkas | Isi |
| --- | --- |
| `src/lib/depreciation.ts` | fungsi murni: `monthsBetween`, `bookValuePerUnit`, `depreciationFor`, `disposalOutcome`, `resolveUsefulLifeMonths` |
| `prisma/schema.prisma` | `Category.usefulLifeMonths Int?` + migrasi `category_useful_life` |
| `src/lib/queries.ts` | `getBookValueItems()` (cache tag `items` + `master`) |
| `src/app/(app)/laporan/nilai-buku/page.tsx` | kartu ringkasan, tabel per barang, tabel pelepasan |
| `src/components/app-nav.tsx` | menu **Nilai Buku** |
| `src/app/(app)/master/page.tsx` | field "Umur ekonomis (bulan)" + meta `susut N bln` di daftar kategori |
| `src/lib/validations.ts` | `usefulLifeMonths` 1..600, bulat; `0` ditolak dengan pesan |
| `smoke.ps1` | bagian **NILAI BUKU** (16 pemeriksaan) |

### Bukti (dijalankan langsung, bukan dari ingatan)

- `tsc` 0, `eslint --max-warnings=0` 0, `npm run build` sukses.
- `smoke.ps1`: **431 pemeriksaan, 0 gagal** (sebelumnya 415).
- **Angka laporan dicek ulang dengan perhitungan terpisah** (Python membaca
  `dev.db` langsung lalu membandingkan tiap baris HTML): 9 baris aktif semuanya
  identik — total perolehan **Rp 100.350.000**, akumulasi **Rp 26.255.207**,
  nilai buku **Rp 74.094.793** (sama dengan "nilai perolehan" di dashboard).
- Bagian pelepasan juga cocok: `INV-2026-0009-PC` (SOLD) **+466.666** dan
  `INV-2026-0008-PRN` (DISPOSED) **−462.500**.
- Pemeriksaan aritmetika di smoke memakai identitas *penyusutan + nilai buku =
  perolehan* per baris (`data-cost`, `data-accumulated`, `data-book-value`), jadi
  tidak bergantung pada tanggal hari ini dan tidak menyalin rumus ke PowerShell.
- Umur ekonomis diuji lewat form master: kategori `ZZ-Smoke-Susut` disimpan dengan
  24 bulan → daftar menampilkan `susut 24 bln` → kategori dihapus lagi. Nilai `0`
  ditolak ("minimal 1 bulan"), bukan disimpan diam-diam.

### Catatan teknis

- `new Date()` di server component **wajib** didahului `await connection()`, kalau
  tidak build gagal dengan `blocking-prerender-current-time`.
- Aturan eslint `react-hooks/immutability` menolak akumulator yang dimutasi di
  dalam `.map()`; hitung baris dulu, lalu total lewat `reduce`. `sort` juga dibuat
  pada salinan (`[...rows].sort`).
- Tanggal disimpan UTC; `monthsBetween` membandingkan komponen UTC dan mengurangi
  satu bulan bila tanggal belum genap — supaya "1 bulan" berarti satu bulan
  kalender penuh, bukan 30 hari.

## Paket 8 — unit test + CI (sesi 21 Oktober 2026)

### Keputusan

- **Vitest** (bukan Jest): konfigurasi alias `@/*` cukup 6 baris, jalan di atas
  Vite yang sudah dipakai Turbopack-era Next, dan tidak butuh transform Babel.
- **Pembagian tugas tes**: `npm test` menguji **fungsi murni** (cepat, menunjuk
  baris yang salah); `smoke.ps1` tetap menguji aplikasi sungguhan lewat HTTP.
  Tidak ada tes yang memalsukan Prisma — kalau butuh database, itu wilayah smoke.
- **CI di `windows-latest`**, bukan ubuntu: `smoke.ps1` memakai PowerShell +
  `System.Net.HttpWebRequest`, dan menjalankannya di runner lain justru menguji
  bahwa skripnya tidak bergantung pada sisa keadaan mesin pengembang.
- **`.env` dibuat di dalam workflow** dengan `SESSION_SECRET` acak tiap run —
  tidak ada rahasia yang disimpan di repo, dan `src/lib/session.ts` tetap menolak
  jalan di produksi tanpa secret yang cukup panjang.

### Yang berubah

| Berkas | Isi |
| --- | --- |
| `vitest.config.ts` | alias `@` + `TZ=Asia/Jakarta` (format tanggal tidak boleh bergantung zona runner) |
| `tests/unit/depreciation.test.ts` | 17 tes: bulan penuh, umur ekonomis, nilai buku, laba/rugi pelepasan |
| `tests/unit/item-code.test.ts` | 7 tes: kode `INV-…`, jenis aset, status non-aktif |
| `tests/unit/format-utils.test.ts` | 12 tes: rupiah/angka/tanggal, `daysUntil`, `buildSearchKey`, `firstParam` |
| `package.json` | `npm test` (`vitest run`) + `npm run test:watch` |
| `.github/workflows/verify.yml` | `npm ci → migrate deploy → tsc → lint → test → build → seed → buat akun → start → smoke` |
| `README.md` | badge status CI |

### Bug yang ketemu justru karena CI (bukan ditulis sengaja)

1. **Halaman di luar jangkauan menampilkan "data kosong".** Di database segar,
   `/movements?page=2` (dan `/items?page=999`) menampilkan *"Belum ada pergerakan
   tercatat"* padahal datanya ada — smoke lama tidak menangkapnya karena `dev.db`
   sudah menumpuk ratusan pergerakan dari run sebelumnya. Sekarang `listItems` dan
   `listMovements` menghitung total lebih dulu lalu **menjepit** nomor halaman ke
   halaman terakhir.
2. **Pemeriksaan paginasi bergantung pada sisa data lokal.** Bagian
   `/movements` di smoke kini adaptif: kalau hanya ada satu halaman, yang diuji
   adalah ketiadaan navigasi + perilaku halaman di luar jangkauan, bukan
   memaksa data yang tidak ada.
3. **Akun uji bisa masuk ke database yang salah.** `create-user.ts` membaca
   `DATABASE_URL` dari `.env`; saat smoke diarahkan ke server dengan `SMOKE_BASE`
   dan DB lain, akunnya dibuat di DB yang salah dan login gagal dengan gejala
   membingungkan. Smoke sekarang memeriksa exit code dan menyebut penyebabnya.

### Bukti (dijalankan langsung, bukan dari ingatan)

- `npm test` → **36 tes, 3 berkas, 0 gagal** (± 3 detik).
- Latihan pipeline CI dijalankan lokal dengan **database kosong**
  (`ci-test.db`): `prisma migrate deploy` → `npm run seed` → `create-user` →
  `next start -p 3101` → `SMOKE_BASE=… ./smoke.ps1` → **432 pemeriksaan, 0 gagal**.
- Database dev (`dev.db`, port 3100) setelah perubahan: **432 pemeriksaan, 0 gagal**.
- `tsc` 0, `eslint src tests scripts --max-warnings=0` 0, `npm run build` sukses.
- `ci-test.db` dihapus lagi setelah latihan (tidak ikut ke repo).

### Catatan

- Workflow menaruh log server sebagai artefak bila gagal — tanpa itu, kegagalan
  `next start` di runner hanya terlihat sebagai "smoke timeout".
- `prisma migrate deploy` (bukan `migrate dev`) dipakai di CI: tidak butuh shadow
  database dan tidak boleh membuat migrasi baru.
- Menambah tes baru: taruh di `tests/unit/*.test.ts`, impor lewat alias `@/…`
  supaya tidak ada path relatif berantakan.

## Hal teknis yang perlu diingat (jangan diulang salahnya)

- **Prisma 7 + `groupBy`:** wajib ada `orderBy`. Dan `groupBy` **tidak boleh**
  berada di dalam `$transaction([...])` — inferensi tipe melebar dan `_count` /
  `_sum` hilang. Gunakan `Promise.all([...])` (sudah diterapkan di
  `src/lib/queries.ts`).
- **Cache Components (`cacheComponents: true`):** route handler menolak
  `export const dynamic`. Server component yang membaca data runtime harus
  berada di dalam `<Suspense>`, dan sebaiknya menerima `params` sebagai
  `Promise` yang di-`await` **di dalam** child yang di-suspend
  (lihat `items/[id]/page.tsx` dan `items/[id]/edit/page.tsx`).
- Nilai waktu (`new Date()`, `Date.now()`) di server component statis →
  bungkus dengan `await connection()` di boundary tersebut. Pasang di **semua**
  boundary yang memakainya, bukan hanya dashboard: `daysUntil()` dipakai di
  `src/app/(app)/page.tsx` **dan** `src/app/(app)/items/[id]/page.tsx`.
- Error `blocking-prerender-current-time` **tidak terlihat dari `next build`**
  kalau rutenya `◐` tanpa `generateStaticParams` — cek `dev.err.log` setelah
  membuka halaman detail di dev. HMR tidak memicu validasi ulang; hapus `.next`
  dan restart `next dev` bila ingin memastikan.
- **Soft delete: query publik menyaring `deletedAt: null`, query "sadar
  Sampah" tidak.** Jangan menyaring `deletedAt` di dalam `getItem()` — kalau
  disaring, halaman detail barang terhapus mati dan aksi pemulihan jadi tidak
  bisa dijangkau sama sekali (inilah bug "pintu satu arah" yang diperbaiki di
  Paket 3). Biarkan pemanggil memutuskan: halaman detail menampilkan alert,
  halaman edit `notFound()`.
- **Dua lapis cache, dua-duanya harus dibereskan.** `connection()` membuat
  halaman detail tidak di-cache di lapisan HTTP (`cache-control: no-store`),
  tetapi **datanya** tetap dilayani entri `"use cache"` bertag
  `CACHE_TAGS.items` di `src/lib/queries.ts`. Jadi setiap aksi yang menulis
  `Item` **wajib** memanggil `updateTag(CACHE_TAGS.items)` — `revalidatePath`
  saja tidak cukup untuk data. Halaman `/items/terhapus` sendiri di-cache
  (`s-maxage=60, stale-while-revalidate`), jadi setelah mengubah DB **di luar
  aplikasi** (mis. `npm run seed`) render pertama masih bisa menyajikan isi
  lama; GET dua kali kalau sedang menguji manual.
- **Teks halaman `not-found` bawaan Next.js selalu ada di payload RSC.**
  Kalimat "…tidak ada atau sudah dihapus dari daftar aktif…" ikut ter-embed di
  respons rute mana pun yang memuat boundary not-found, jadi pemeriksaan
  substring pendek seperti `sudah dihapus dari daftar aktif` **selalu** lolos
  dan tidak membuktikan apa pun. Cari potongan yang benar-benar unik
  (mis. `Barang ini sudah dihapus`) dan sadari bahwa `/items/<id>` yang tidak
  ada tetap berstatus **200** karena `notFound()` dipanggil setelah streaming.
- `src/lib/prisma.ts` memakai
  `path.resolve(/* turbopackIgnore: true */ process.cwd(), filePath)` untuk
  membungkam peringatan Turbopack.
- Master CRUD bersifat data-driven lewat `MasterFieldDef` / `MasterRow` /
  `MasterAction`.
- **Zod 4:** jangan bikin helper generik dengan parameter `z.ZodType` lalu
  memanggil `schema.default(fallback)` — `output<T>`-nya melebar jadi `unknown`
  dan TypeScript menolak (`TS2769: No overload matches this call`). Pola yang
  dipakai di `src/lib/validations.ts` (`enumOrDefault`) adalah menaruh nilai
  default di dalam `z.preprocess((value) => emptyToUndefined(value) ?? fallback,
  schema)`.
- **`Item.price` adalah harga SATUAN.** Jangan pernah memakainya sebagai nilai
  total, dan jangan menolkan nilainya saat barang dibuang/dijual.
- **`smoke.ps1` dijalankan terhadap build produksi** (`npm run build` lalu
  `npm run start -- -p 3100`), sesuai `README.md`. Menjalankannya ke server
  **dev** (port 3000) memunculkan **3 kegagalan palsu** di bagian Sampah —
  `items(setelah pulih)` dan `trash(setelah hapus lagi)` (×2) membaca halaman
  tepat sesudah aksi `Pulihkan`/`Hapus` dan belum melihat perubahannya.
  Mekanismenya belum ditelusuri sampai akar (kandidat: render/cache di dev),
  tetapi jalur yang sama di server produksi **289/289 hijau** dan data di DB
  akhirnya benar — jadi jangan menyimpulkan regresi hanya dari hasil di dev.
- **`searchKey` basi punya dua jalur, bukan satu.** Selain rename data master,
  memindahkan barang juga mengganti nama lokasi di dalam kunci. Keduanya sudah
  ditangani (Paket 5 #1). Jalur ketiga — hapus data master — **ditutup dengan
  menolak penghapusan** (Paket 5 #2), jadi `delete*Action` memang tidak perlu
  merapikan apa pun: baris master yang masih dirujuk tidak pernah terhapus.
- **URL berekstensi gambar dilewatkan `proxy.ts`.** Matcher proxy punya pengecualian
  `.*\.(?:png|jpg|jpeg|svg|webp|ico|txt|css|js)$` untuk aset statis, jadi rute
  seperti `/api/photos/<uuid>.jpg` **tidak melewati proxy** dan tidak mendapat
  proteksi sesi dari sana. Setiap rute baru yang URL-nya berakhiran ekstensi
  gambar wajib memanggil `isAuthenticated()` sendiri (dilakukan di
  `src/app/api/photos/[name]/route.ts`).
- **`next/image` tidak bisa dipakai untuk berkas ber-sesi.** Pengoptimal Next
  mengambil gambar dari server tanpa cookie, sehingga `/api/photos/...` dibalas
  401. Pakai `<img>` + `eslint-disable-next-line @next/next/no-img-element`
  (beralasan) seperti di `photo-field.tsx`, `item-photo.tsx`, `items-table.tsx`,
  dan `items/[id]/page.tsx`.
- **Batas body Server Action naik ke 6 MB** (`experimental.serverActions.
  bodySizeLimit`), sedangkan batas unggahan foto tetap 5 MB di aplikasi. Kalau
  batas aplikasi dinaikkan, angka body juga harus naik — kalau tidak, unggahan
  ditolak framework sebelum validasi kita sempat berbicara.
- **`Submit-Action` di `smoke.ps1` bisa mengirim berkas** lewat parameter `$file`
  (nama field → `Path`/`FileName`/`ContentType`). Bagian berkas ditulis sebagai
  byte mentah ke `MemoryStream`; jangan pernah memasukkannya ke `StringBuilder`
  karena isinya biner. Untuk mengirim ulang form barang yang punya banyak field
  wajib, pakai `Get-ItemFormValues` (membaca nilai dari HTML form) — **jangan**
  mengisi sebagian field saja, karena `updateItemAction` menulis semua kolom:
  field yang tidak ikut terkirim akan dikosongkan. Aksi yang berakhir `redirect()`
  dibalas **303**, bukan 200.
- **Di dalam string PowerShell, `?` adalah bagian dari nama variabel.**
  `"/items/$id?photo=uploaded"` **tidak** menghasilkan URL itu: `$id?photo` dibaca
  sebagai satu nama variabel (tidak ada), sehingga stringnya rusak jadi
  `/items/=uploaded` — tanpa error apa pun, hanya halaman 404 yang membingungkan.
  Susun path ber-query lewat penggabungan (`"/items/$id" + '?photo=uploaded'`)
  atau lekati dengan backtick. Ini sempat membuang waktu saat mendiagnosis
  (tampak seperti bug PPR pada halaman detail, padahal skrip diagnostiknya yang
  salah).
- **Data dev dipakai bersama, jadi jangan mengandalkan kondisi awal barang.**
  Bagian foto di `smoke.ps1` dulu menganggap barang pertama di daftar belum
  berfoto; satu unggahan lewat UI sudah cukup mematahkan anggapan itu (terjadi di
  sesi ini). Sekarang barang ujinya **dicari** dari daftar (barang pertama yang
  halaman detailnya memuat `Belum ada foto`). Kalau bagian smoke lain nanti butuh
  kondisi khusus, pilih datanya di skrip alih-alih berasumsi.

## Artefak

- `smoke.ps1` (root project) — skrip smoke test, **dipertahankan**.
- `dev.db` — database SQLite berisi data seed.
- `uploads/items/` — berkas foto barang (di-gitignore). Bukan artefak uji: isinya
  data pengguna, jadi **jangan** dihapus saat bersih-bersih. Folder dibuat
  otomatis saat unggahan pertama.
- `smoke.log` — output smoke test terakhir (boleh dihapus kapan saja).
- `scripts/rebuild-search-keys.ts` (+ `npm run rebuild-search-keys`) —
  **dipertahankan**: backfill idempoten kolom `searchKey`. Ini satu-satunya isi
  `scripts/`; semua skrip `tmp-*.ts` / `tmp-*.ps1` dari sesi ini sudah dihapus.
- Server `next start -p 3100` dipakai untuk verifikasi sesi 9 Oktober 2026,
  12 Oktober 2026, dan 16 Oktober 2026; matikan dengan `Stop-Process` bila sudah
  tidak dipakai.
  Perintah verifikasi lengkap (build → seed → "panaskan" cache → smoke):

  ```powershell
  npm run build
  npm run start -- -p 3100    # terminal terpisah
  npm run seed                # mengembalikan INV-2026-0010 ke kondisi terhapus
  # Cache halaman di-cache dengan stale-while-revalidate: jalankan smoke DUA KALI
  # (run pertama menyajikan isi lama sekaligus memanaskan cache), lalu:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke.ps1
  ```

- Skrip debug sementara dari sesi 12 Oktober 2026 (`tmp-trash-debug.ps1`,
  `tmp-grep.ps1`, `tmp-warm.ps1`, `tmp-*.log`, `tmp-detail.html`,
  `tmp-verify-code.ps1`, `tmp-cleanup.ts`) sudah **dihapus** — jangan commit file
  semacam itu; pakai `Get-Html`/`Submit-Action` di `smoke.ps1` kalau butuh
  membedah HTML, dan pakai `npx tsx` + `prisma` dari `src/lib/prisma.ts` untuk
  membedah database. Hal yang sama berlaku untuk sesi 15 Oktober 2026
  (`tmp-ids.ts`, `tmp-keys.ts`, `tmp-move-check.ts`, `tmp-cleanup.ts`,
  `tmp-verify-search-keys.ts`, `tmp-final.ts`, `smoke-port3000.tmp.ps1`) —
  semuanya sudah dihapus, begitu pula `scripts/tmp-verify-final.ts` dari sesi
  16 Oktober 2026 (foto barang). `dev-server.log` / `dev-server.err.log` dari
  server dev latar belakang juga artefak lokal, bukan bagian aplikasi.

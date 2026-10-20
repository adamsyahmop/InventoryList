This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Inventory List

Aplikasi pencatatan inventaris barang: kode unik (boleh dibuat otomatis dengan
suffix jenis, mis. `INV-2026-0011-LPT`), nama, merek, jenis/kategori, tanggal
beli, harga, lokasi, supplier, garansi, kondisi, status, dan **foto barang**
(diunggah dari HP/komputer) — lengkap dengan cabang (lokasi, pembeli, pemilik),
metadata pelepasan aset (dibuang / dijual), riwayat pergerakan barang, halaman
**Sampah** (soft delete + pemulihan), **label QR siap cetak per barang**, ekspor
**Excel (.xlsx)** dengan satu sheet per tahun (mengikuti filter yang sedang
dipakai di daftar barang), serta **impor `.xlsx`** untuk memasukkan banyak
barang sekaligus (lihat `src/lib/item-import.ts`).

Stack: **Next.js 16.4.0** (Turbopack, Cache Components + Partial Prefetching) ·
**Prisma 7.10.0** · **SQLite** (`dev.db`) · **Zod** · **`qrcode`** (QR SVG
server-side) · **`exceljs`** (penyusun berkas .xlsx) · Tailwind CSS 4.

> Halaman aplikasi berada di `src/app/(app)/`, bukan `app/page.tsx`. Proteksi
> rute ada di `src/proxy.ts` (Proxy Next.js 16, Node.js runtime).

## Setup & menjalankan

```bash
cp .env.example .env     # lalu sesuaikan APP_PASSWORD & SESSION_SECRET
npm install
npx prisma migrate deploy # atau: npx prisma migrate dev
npm run seed             # isi data contoh (10 barang, master, riwayat pergerakan)
npm run rebuild-search-keys # DB lama saja: hitung ulang kolom searchKey (aman diulang)
npm run dev              # http://localhost:3000
```

Variabel lingkungan yang dipakai (`src/lib/session.ts`):

| Variabel | Fungsi |
| --- | --- |
| `DATABASE_URL` | Koneksi database (`file:./dev.db` untuk SQLite) |
| `APP_PASSWORD` | Password halaman login. **Wajib di produksi**; nilai `admin` hanya berlaku di `next dev` |
| `SESSION_SECRET` | Kunci HMAC penanda tangan cookie sesi, **minimal 32 karakter**. **Wajib di produksi** |

## Impor barang (.xlsx)

`/items/import` menerima berkas `.xlsx` dengan kolom seperti hasil ekspor. Aturan
utamanya:

| Hal | Perilaku |
| --- | --- |
| Kolom wajib | `Nama` saja; sisanya berdefault (jumlah 1, satuan `unit`, harga 0, kondisi `Baik`, status `Tersedia`, sumber `Kantor Pusat`) |
| Kode | Kosong → server membuat nomor berikutnya. Kode yang sudah dipakai **ditolak**, bukan ditimpa (impor ulang berkas yang sama = semua baris dilewati) |
| Data master | Kategori/merek/unit/lokasi/supplier/cabang dicocokkan **berdasarkan nama** dan harus sudah ada — tidak dibuat otomatis |
| Tanggal | Tanggal asli Excel atau teks `dd/mm/yyyy`; tanggal mustahil (`31/13/2026`) ditolak |
| Batas | 500 baris per berkas, 6 MB; sheet yang bukan daftar barang (mis. `Ringkasan`) dilewati |
| Foto | Tidak ikut diimpor |

Setiap baris bermasalah dilaporkan dengan nama sheet, nomor baris, dan alasannya;
baris lain tetap masuk. Barang hasil impor mendapat catatan pergerakan
"Pencatatan awal (impor)" seperti barang yang dibuat lewat form.

## Verifikasi (smoke test)

`smoke.ps1` menguji runtime end-to-end lewat HTTP: proteksi Proxy tanpa cookie,
login sungguhan lewat POST form (password benar → 303 + cookie, password salah →
pesan error), semua halaman utama dengan cookie sesi, isi konten penting
(termasuk angka dashboard dan nilai aset aktif vs nilai perolehan), filter
cabang/sumber/unit pengelola, ekspor Excel (berkas .xlsx diperiksa isinya lewat
`System.IO.Compression`: nama sheet, format angka, dan tanggal asli Excel),
**penolakan hapus data master yang masih dipakai**, **unggah & penyajian foto
barang**, empty state filter, UI 404, **throttle login** (5 kegagalan per IP →
kunci 15 menit), dan **impor `.xlsx`** (halaman impor, penolakan berkas non-xlsx,
serta impor ulang berkas ekspor yang seluruh barisnya jadi duplikat), dan
**ekspor mengikuti filter** (isi berkas, nama `-terfilter`, serta tombol toolbar
membawa query aktif). Total **329 pemeriksaan**.

Bagian **SAMPAH** di skrip itu menguji soft delete secara end-to-end: barang
terhapus tampil di `/items/terhapus` dan absen dari daftar aktif/ekspor Excel,
tombol Edit dan form pergerakan tidak tersedia untuk barang terhapus, lalu aksi
**Pulihkan** benar-benar dieksekusi (POST multipart form server action, jalur
tanpa JavaScript) dan diverifikasi lewat daftar aktif, empty state Sampah, serta
baris riwayat baru. Di akhir, barang dihapus lagi supaya isi Sampah kembali
seperti kondisi seed.

Bagian **KODE OTOMATIS, JENIS BARANG & LABEL QR** memeriksa bahwa form barang
baru **tidak** mewajibkan kode (ada hint `Kosongkan untuk dibuat otomatis` dan
pilihan jenis `PC`/`LPT`), halaman detail menampilkan `Jenis barang` + kartu QR
berupa `<svg` (tanpa menunjuk layanan gambar pihak ketiga), dan
`/items/[id]/label` merender label cetak berisi `<svg`, aturan `print-area`,
kode yang **sama** dengan halaman detail, serta tautan QR ke `/items/<id>`.
Bagian ini sengaja tidak menulis apa pun ke database, jadi bisa dijalankan
berulang tanpa mengubah angka dashboard.

Bagian **HAPUS DATA MASTER** menguji kebijakan hapus `/master` lewat jalur tanpa
JavaScript: baris seed yang masih dipakai (`Elektronik`, `Gudang A`,
`Kantor Pusat`) di-POST ke form Hapus-nya dan harus **ditolak** dengan jumlah
pemakaian yang terbaca di HTML (`\d+ barang`, `\d+ barang, \d+ pergerakan`,
`\d+ barang, \d+ lokasi`); pesannya harus tampil sebagai `role="alert"` dan
barisnya harus **masih ada** sesudahnya. Sesudah itu jalur sukses diuji dengan
baris sementara (kategori `ZZ-Smoke-Kategori`) dan rujukan **tidak langsung**
(cabang sementara ditolak selama satu lokasi sementara menunjuk ke sana, lalu
keduanya dihapus). Semua baris sementara dihapus di bagian yang sama, jadi isi
database kembali seperti semula.

Bagian **FOTO BARANG** menguji unggah foto lewat jalur tanpa JavaScript: berkas
JPEG biner dikirim ke form di halaman detail, nilainya tersimpan sebagai
`/api/photos/<uuid>.jpg`, lalu **disajikan kembali** oleh route handler sendiri
(200 + `image/jpeg`, panjang byte sama) dan **ditolak tanpa sesi** (401) karena
berkasnya sengaja tidak ditaruh di `public/`. Bagian ini juga memverifikasi nama
berkas kiriman klien tidak dipakai (nama dibuat server, pola UUID + ekstensi),
path traversal `..%2F..%2Fdev.db` ditolak (404), berkas non-gambar dan berkas
5,2 MB ditolak dengan pesan yang terbaca pengguna, foto **diganti** lewat form
edit (berkas lama ikut dibuang) lalu **dipertahankan** saat form edit disimpan
ulang tanpa berkas, dan terakhir penghapusan foto membuang berkasnya dari disk.
Form edit dikirim ulang dengan nilai field yang dibaca dari HTML-nya sendiri
(`Get-ItemFormValues`), jadi bagian ini sekaligus membuktikan menyimpan ulang
**tidak menghapus** data barang. Keterangan **"Foto barang berhasil diunggah."**
juga ikut diperiksa: muncul setelah unggah dari kartu foto, muncul lagi di
halaman detail setelah form disimpan dengan berkas baru (pengalihan membawa
penanda `?photo=uploaded`), dan **tidak** muncul saat form disimpan ulang tanpa
berkas. Barang ujinya dipilih skrip dari daftar barang (yang belum punya foto),
jadi bagian ini tetap jalan walau data dev sudah berisi unggahan lewat UI.

```bash
npm run build
npm run start -- -p 3100        # jalankan di terminal terpisah
powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke.ps1
```

Skrip mencetak `TOTAL: <n> pemeriksaan, <m> gagal` dan `exit 1` bila ada yang
gagal. Token sesi dibuat manual di dalam skrip memakai HMAC-SHA256, jadi
konstanta `$secret` di `smoke.ps1` **harus sama** dengan `SESSION_SECRET` di
`.env`. Blok login POST membaca `APP_PASSWORD` langsung dari `.env` (fallback
`admin`), jadi tidak ada password yang di-hardcode di skrip.

> Catatan: tiap run smoke menulis **dua** baris audit — `Dihapus ke Sampah` dan
> `Pemulihan dari Sampah` — yang **tidak dihapus** oleh `npm run seed` (seed hanya
> membuat movement untuk barang yang belum punya, dan fixture-nya cuma 2
> pergerakan). Jadi angka "pergerakan" yang dicetak seed naik 2 setiap kali smoke
> dijalankan, dan pemeriksaan riwayat di skrip sengaja dihitung sebagai **delta**,
> bukan jumlah tetap. Untuk reset bersih: hapus `dev.db` →
> `npx prisma migrate deploy` → `npm run seed`.

> Catatan: pemeriksaan angka dashboard (`112.600.000`, `100.350.000`, `31 unit
> masih dimiliki`) memakai **angka tetap data seed**, jadi akan gagal bila
> `dev.db` berisi barang tambahan hasil uji manual — angka seed adalah total
> untuk **9 barang aktif**. Barang yang baru dibuat lewat form tidak dihapus oleh
> `npm run seed`, jadi hapus dulu barisnya (atau reset `dev.db` seperti di atas)
> sebelum menyalahkan aplikasi. Per 16 Oktober 2026 baris uji
> `INV-2026-0011-ELE` sudah dibersihkan, `dev.db` berisi 10 barang (9 aktif + 1
> ter-soft-delete), dan hasilnya **289 pemeriksaan, 0 gagal** (16 Oktober 2026).

> Foto barang disimpan sebagai **berkas** di `uploads/items`, di luar `public/`
> dan di-gitignore (folder dibuat otomatis saat unggahan pertama). Isinya tidak
> ikut `dev.db`, jadi ikutkan folder itu ke backup; kalau dihapus, kolom
> `photoUrl` barang tetap ada tetapi gambarnya hilang. Batas ukuran 5 MB di
> aplikasi, sedangkan batas body Server Action dinaikkan ke 6 MB lewat
> `experimental.serverActions.bodySizeLimit` di `next.config.ts` (foto dari HP
> dikecilkan dulu di browser oleh `photo-field.tsx`).

> Jalankan smoke terhadap **hasil `npm run build`** seperti di atas, bukan
> terhadap `npm run dev`. Di server dev, pemeriksaan Sampah yang membaca halaman
> tepat sesudah aksi `Pulihkan`/`Hapus` bisa gagal (3 pemeriksaan) karena
> halamannya belum memperlihatkan perubahan; pada build produksi jalur yang sama
> hijau.

> `smoke.ps1` mengambil id barang dari HTML dengan pola yang **dikaitkan ke
> `href="/items/<id>"`**, bukan pola id yang longgar. Di mode dev, payload RSC
> ikut memuat jalur modul klien (mis. `restore-item-button.tsx`) yang juga cocok
> dengan pola longgar sehingga id yang diambil bisa salah. Jangan melonggarkan
> pola itu kembali.

> Hindari karakter non-ASCII (`×`, `·`) sebagai teks yang dicari di `smoke.ps1`:
> Windows PowerShell 5.1 membaca skrip UTF-8 tanpa BOM sebagai ANSI sehingga
> pencocokannya gagal. Pakai potongan ASCII saja.

> Catatan: request ke `/items/<id-yang-tidak-ada>` mengembalikan **HTTP 200**
> dengan UI 404 di dalam body. Ini perilaku resmi Next.js — `notFound()` dipanggil
> setelah shell streaming, sehingga status code sudah terkunci di `200`. Next.js
> menambahkan `<meta name="robots" content="noindex">` sebagai kompensasi.

> Catatan: error runtime ditangani tiga boundary berlapis — `app/global-error.tsx`
> (root layout sendiri yang gagal; wajib punya `<html>`/`<body>` dan memakai
> inline style karena `globals.css` belum tentu termuat), `app/error.tsx`
> (segmen akar, mis. `/login`), dan `app/(app)/error.tsx` (di dalam rangka
> aplikasi, navbar tetap tampil). Ketiganya memakai `retry()` dari Next 16.3+
> lewat komponen bersama `src/components/ui/error-fallback.tsx`.

> Catatan: cache `"use cache"` dibuang lewat `updateTag`, bukan `revalidatePath`.
> Aksi yang menulis `Item`/`ItemMovement` memanggil `invalidateItemCaches()`,
> sedangkan aksi data master memanggil `invalidateMasterCaches()` — yang terakhir
> ikut membuang tag `movements` karena tabel pergerakan menampilkan **nama**
> lokasi; tanpa itu, mengganti nama lokasi meninggalkan nama lama di riwayat
> sampai `cacheLife("minutes")` habis.

> Catatan: dashboard dan `/items/[id]` memakai `daysUntil()` yang membaca waktu
> sekarang. Cache Components menolak nilai waktu tidak stabil di dalam shell
> statis, jadi kedua boundary itu diawali `await connection()`. Bila lupa, dev
> overlay menampilkan `Blocking Route Server: Next.js encountered the unstable
> value new Date() while prerendering`. Error ini **tidak** muncul di
> `next build` (rute `◐` tanpa `generateStaticParams` hanya membuat shell
> fallback), jadi biasakan cek `dev.err.log` setiap menambah pemakaian
> `new Date()` / `Date.now()` baru di server component.

## Catatan data

- **`Item.price` adalah harga SATUAN**, bukan total (form barang berlabel
  `Harga satuan (Rp)`). Karena itu nilai inventaris di dashboard dihitung
  `SUM(price * quantity)` — angka yang sama dengan "Total nilai" di halaman
  detail barang.
- `Item.deletedAt` menerapkan soft delete: daftar aktif, dashboard, dan ekspor
  Excel semuanya memfilter `deletedAt: null`. Pengecualiannya disengaja —
  `getItem()` dan `listDeletedItems()` di `src/lib/queries.ts` **tidak**
  menyaring, supaya barang terhapus tetap bisa dibuka (halaman detailnya
  menampilkan alert) dan dipulihkan. Menyaring `deletedAt` di `getItem()` membuat
  aksi pemulihan tidak bisa dijangkau sama sekali.
- Data seed memuat satu barang yang sengaja sudah terhapus (`INV-2026-0010`)
  sebagai bahan uji halaman Sampah. Karena ter-soft-delete, angka dashboard dan
  ekspor Excel **tidak** terpengaruh.
- Kolom `Item.searchKey` menyimpan versi lowercase dari kode, nama, merek,
  lokasi, cabang (lokasi/pembeli/pemilik), unit pengelola, supplier, alasan
  pembuangan, dan catatan. Pencarian memakai kolom ini supaya case-insensitive
  dan berperilaku sama di SQLite maupun PostgreSQL.
- Karena `searchKey` ikut menyalin **nama** relasi, nilainya dihitung ulang
  setiap kali sumbernya berubah: menyimpan nama/kode data master di `/master`
  (cabang, unit pengelola, kategori, merek, lokasi, supplier) dan memindahkan
  barang ke lokasi lain. Tanpa itu, `?q=` masih menemukan barang lewat nama
  lama dan gagal menemukannya lewat nama baru. Untuk database yang sudah terisi
  dari versi sebelum perbaikan ini, jalankan `npm run rebuild-search-keys` satu
  kali (aman diulang; hanya menulis kolom `searchKey`).
- Menghapus baris data master **ditolak** selama barisnya masih dirujuk, jadi
  referensi tidak pernah berubah menjadi `null` diam-diam. Semua relasi master
  memakai `onDelete: SetNull` (`schema.prisma`), sehingga `prisma.*.delete`
  sebenarnya selalu "berhasil": barang kehilangan kategori/lokasi/unit dan
  riwayat pergerakan kehilangan nama lokasi. Karena itu keenam `delete*Action` di
  `src/lib/actions/master.ts` menghitung pemakaian **dan** menghapus di dalam
  satu `$transaction` (`describeMasterUsage()`), lalu menolak dengan pesan
  berisi jumlahnya — mis. `Kategori ini masih dipakai oleh 7 barang. Pindahkan
  atau ganti referensinya dulu sebelum menghapus.` atau `Lokasi ini masih dipakai
  oleh 5 barang, 36 pergerakan. Riwayat pergerakan tidak boleh kehilangan
  lokasi.` (angka contoh dari run terakhir; jumlah `pergerakan` bertambah 2
  setiap kali smoke dijalankan). Pemakaian yang dihitung: cabang
  (`sourceBranchId`, `ownerBranchId`, atau lokasi miliknya — plus jumlah
  lokasinya), unit pengelola / kategori / merek / supplier (barang), dan lokasi
  (barang + `fromLocationId` / `toLocationId` pada pergerakan). Pesannya tampil
  sebagai `Alert` `role="alert"` di baris yang gagal (`master-manager.tsx`).
- Karena penghapusan hanya jalan saat pemakainya sudah kosong, menghapus data
  master **tidak mungkin** meninggalkan `searchKey` basi — tidak ada barang yang
  masih menunjuk baris itu. Itu sebabnya `refreshItemSearchKeysByIds()` hanya
  dipakai jalur pindah lokasi (`createMovementAction`), bukan `delete*Action`.

## Sampah (soft delete & pemulihan)

Menghapus barang **tidak** membuang datanya — hanya mengisi `deletedAt`,
sehingga riwayat pergerakan dan nilai perolehannya tetap utuh untuk audit.

- `/items/terhapus` (menu **Sampah**) menampilkan barang terhapus: kode, nama,
  waktu dihapus, status terakhir, dan nilai. Tiap baris punya tombol
  **Pulihkan**; halaman detailnya tetap bisa dibuka dan menampilkan alert
  "Barang ini sudah dihapus…" beserta alasan pembuangannya.
- `restoreItemAction` (`src/lib/actions/items.ts`) menolak item yang tidak
  terhapus, lalu **dalam satu transaksi** mengosongkan `deletedAt`,
  mengembalikan status ke `AVAILABLE`, dan menulis `ItemMovement` beralasan
  `"Pemulihan dari Sampah"`. Setelah itu `updateTag(CACHE_TAGS.items)` dipanggil
  supaya daftar aktif, Sampah, dashboard, dan riwayat langsung konsisten.
- Menghapus juga memaksa `status = DISPOSED`, jadi kolom "Status terakhir" di
  Sampah selalu `Dibuang` dan pemulihan selalu mengembalikan barang ke
  `AVAILABLE` — status sebelum dihapus tidak disimpan.
- `deleteItemAction` menulis `ItemMovement` beralasan `"Dihapus ke Sampah"`
  **dalam satu transaksi** bersama perubahan barangnya, jadi penghapusan selalu
  meninggalkan jejak audit. Status barang dibaca di dalam transaksi yang sama,
  sehingga mengirim tombol Hapus dua kali tidak menambah catatan kedua.
- Barang terhapus tidak bisa disunting (`/items/[id]/edit` → not-found) dan
  tidak punya form pergerakan di halaman detailnya, jadi statusnya tidak bisa
  "diubah diam-diam" selama berada di Sampah.
- Semua aksi ini diuji end-to-end oleh bagian **SAMPAH** di `smoke.ps1`.

## Foto barang

Tiap barang punya **satu foto utama** (`Item.photoUrl`), diunggah dari halaman
detail maupun dari form barang.

- **Berkas disimpan di `uploads/items/`**, bukan di `public/` (folder itu
  di-gitignore dan dibuat otomatis). Foto dari HP dikecilkan dulu di browser
  (`photo-field.tsx`: sisi terpanjang 1600 px → JPEG) supaya hemat kuota, dan
  server tetap menolak berkas di atas **5 MB**.
- **Jenis berkas ditentukan dari isi berkas** (magic bytes JPEG/PNG/WEBP/GIF),
  bukan nama atau `Content-Type` kiriman klien. Nama berkas dibuat server
  (`randomUUID()` + ekstensi hasil pembacaan isi), jadi nama kiriman klien tidak
  pernah menyentuh disk.
- **Penyajian lewat `/api/photos/[name]`** yang memeriksa sesi sendiri (401 tanpa
  cookie, 404 bila tidak ada). Matcher di `src/proxy.ts` melewatkan URL
  berekstensi gambar, jadi rute ini **tidak** boleh mengandalkan proxy. Respons
  dibalas `private, immutable` + `nosniff` karena nama berkas unik per unggahan.
- Halaman detail punya kartu **Foto barang** dengan tombol Unggah/Ganti/Hapus
  yang aksinya hanya menyentuh `photoUrl`, dan daftar barang menampilkan
  thumbnail. Mengganti foto membuang berkas lama **setelah** database berhasil
  disimpan; menyimpan ulang form **tanpa** berkas mempertahankan foto lama.
- Setelah unggahan tersimpan, pengguna mendapat keterangan **"Foto barang
  berhasil diunggah."** — dari kartu foto (pesan hasil aksi) atau di halaman
  detail setelah menyimpan form barang yang menyertakan foto (aksi mengalihkan
  halaman, jadi penandanya dititipkan di URL `?photo=uploaded`). Menyimpan tanpa
  berkas baru tidak memberi keterangan itu, dan pesan tidak menempel terus:
  begitu pengguna menghapus fotonya, keterangan diganti pesan aksi terakhir.
- Foto **tidak** ikut ekspor Excel, dan soft delete barang **tidak** menghapus
  berkasnya (barangnya masih bisa dipulihkan). Berkas hanya dibuang saat foto
  diganti atau dihapus.
- Semua ini diuji end-to-end oleh bagian **FOTO BARANG** di `smoke.ps1`.

## Kode barang otomatis, jenis barang & label QR

- **Kode tidak lagi wajib diketik.** Kolom Kode di form barang boleh dikosongkan;
  server yang membentuknya: `INV-<tahun>-<urut 4 digit>-<jenis>`, mis.
  `INV-2026-0011-LPT`. Urutan dihitung global per tahun dan nomor yang sudah
  terpakai tidak didaur ulang (`generateItemCode()` di
  `src/lib/actions/items.ts`); `Item.code` tetap `@unique` sebagai jaring
  pengaman terakhir.
- **Kode yang sudah ada tidak pernah ditulis ulang otomatis.** Barang contoh
  seed ikut memakai format lengkap (`INV-2026-0001-LPT`, `INV-2026-0009-PC`,
  … `INV-2026-0010-FRN`) karena fixture-nya memang diperbarui; kode
  lama/manual yang diketik tanpa suffix tetap sah apa adanya. Saat mengedit,
  kode yang sudah ada dipertahankan bila kolomnya dikosongkan.
- **Jenis barang** berbeda dari kategori: `Item.assetType` menyimpan kode pendek
  (`PC`, `LPT`, `PRN`, `MON`, `NET`, `MOB`, `FRN`, `ELE`, `LAIN`) dengan label
  manusiawi lewat `ITEM_TYPE_LABELS` / `itemTypeLabel()` di
  `src/lib/constants.ts`. Kategori tetap menjawab "barang apa" dan dikelola di
  `/master`.
- **Label QR** ada di `/items/[id]/label`: QR SVG yang dibuat server-side dengan
  library `qrcode` (`src/lib/qr.ts`) + kode, nama, jenis, kondisi, lokasi, dan
  status, lengkap dengan tombol **Cetak label**
  (`src/components/print-button.tsx`) dan aturan `@media print` (`.print-area`)
  supaya hanya label yang tercetak.
- QR memuat **URL** `/items/<id>` (bukan kodenya), jadi label tetap sah walau
  kode/nama barang nanti diubah. Alamatnya diambil apa adanya dari
  `requestOrigin()` (header request), sehingga dari HP label hanya bisa dibuka
  bila alamat aplikasi memang dapat diakses dari jaringan itu (bukan
  `localhost`).

## Ekspor Excel (`.xlsx`)

Tombol **Export Excel** di navbar mengunduh `inventaris-<YYYY-MM-DD>.xlsx` dari
`GET /api/export` (`src/app/api/export/route.ts`). Berkasnya disusun
`buildInventoryWorkbook()` di `src/lib/excel.ts` memakai `exceljs`, yang butuh
runtime Node — karena itu `exceljs` didaftarkan di `serverExternalPackages`
(`next.config.ts`) agar tidak ikut di-bundle Turbopack. Segment config
`runtime = "nodejs"` sengaja **tidak** dipakai: `cacheComponents` di Next.js 16
melarangnya, dan runtime Node memang sudah jadi default route handler.

Isi workbook:

| Sheet | Isi |
| --- | --- |
| `Ringkasan` | Satu baris per tahun: Jumlah Barang, Total Unit, Total Nilai Perolehan, ditutup baris `TOTAL` + catatan aturan pengelompokan |
| `2026`, `2025`, … | Satu sheet per **tahun pada kode barang**, tahun terbaru lebih dulu, baris diurutkan per kode |
| `Tanpa Tahun` | Barang yang kodenya tidak memuat tahun (mis. kode manual lama); hanya dibuat bila ada |

Aturan pengelompokan diambil dari `itemCodeYear()` (`src/lib/constants.ts`,
regex `/^INV-(\d{4})\b/i`), jadi `INV-2026-0011-LPT` masuk sheet `2026`
sementara `LAPTOP-01` atau `INV-20260-0001` (tahun 5 digit) masuk
`Tanpa Tahun`.

Detail penyajian: header dibekukan (`ySplit: 1`), `autoFilter` hanya mencakup
baris data sehingga baris `TOTAL` tidak ikut tersaring, orientasi **landscape**
dengan `fitToWidth: 1` supaya 28 kolom muat saat dicetak. Kolom angka dan
tanggal ditulis sebagai nilai asli Excel, bukan teks — `"Rp"#,##0` untuk
Harga / Total Nilai / Harga Jual, `#,##0` untuk Jumlah, dan `dd/mm/yyyy` untuk
keempat kolom tanggal — sehingga bisa langsung dijumlah dan diurutkan di Excel.
Nilai enum ditulis sebagai label manusia (`ITEM_STATUS_LABELS` dan sejenisnya),
pemilik aset kosong tampil sebagai `Kantor pusat`, dan unit pengelola sebagai
`Nama (KODE)`.

Barang ter-soft-delete (`deletedAt` terisi) **tidak** ikut diekspor. Ekspor saat
ini selalu memuat seluruh dataset aktif dan belum mengikuti filter di
`/items`.

## Cabang & pelepasan aset

Tiga dimensi yang sengaja dipisah:

| Dimensi | Pertanyaan | Kolom |
| --- | --- | --- |
| Kategori | barang **apa** | `Item.categoryId` |
| Unit pengelola | barang **dikelola unit apa** | `Item.departmentId` |
| Lokasi | barang **di mana** | `Item.locationId` (+ `Location.branchId`) |
| Perolehan / kepemilikan | **dibeli siapa / milik siapa** | `Item.acquisitionSource`, `Item.sourceBranchId`, `Item.ownerBranchId` |

- `Branch` (kode unik, mis. `BDG`) dikelola di `/master` bersama unit pengelola,
  kategori, merek, lokasi, dan supplier. Lokasi boleh ditautkan ke satu cabang.
- `Department` (label UI **Unit pengelola**, mis. `IT` / `GA`) menjawab "siapa
  yang memakai & merawat barang ini sehari-hari" — sengaja dipisah dari
  kategori (barang apa), `assetType` (wujud/akhiran kode), dan lokasi (di mana).
  Satu unit bisa mengelola banyak jenis barang, dan relasinya `onDelete:
  SetNull` supaya menghapus unit tidak ikut menghapus barangnya — penghapusan
  tetap ditolak selama unit itu masih dipakai barang.
- Berpindah unit **tidak mengubah kode** yang sudah dicetak di label fisik
  (`generateItemCode()` tidak melihat `departmentId`). Nama & kode unit ikut
  masuk `Item.searchKey`, jadi mengetik `IT` di pencarian langsung menemukan
  barangnya.
- **Filter** `?departmentId=` di `/items` menyaring per unit pengelola, terpisah
  dari `?categoryId=` dan `?branchId=`.
- `ownerBranchId` kosong berarti aset milik **Kantor pusat**.
- Kartu depan dashboard memakai **jumlah** barang (jenis & unit), bukan nilai
  rupiah. Sebaran jumlah barang per cabang digambar sebagai donut SVG di
  `src/components/dashboard/branch-donut.tsx` — tanpa library chart supaya tetap
  server component dan tidak menambah dependency. Nilai aset tetap tersedia di
  tabel per cabang (baris **Total**) dan kartu "Pelepasan aset".
- **Filter** `?branchId=` di `/items` menyaring berdasarkan cabang **lokasi**
  (barang ada di mana), sedangkan kartu "Nilai aset aktif per cabang" di
  dashboard menyaring berdasarkan **kepemilikan** (aset ini milik siapa).
- Barang `DISPOSED` (dibuang) dan `SOLD` (dijual) **tidak** dihapus dan `price`
  -nya **tidak** dinolkan — jejak audit tetap utuh. Keduanya hanya dikeluarkan
  dari perhitungan **nilai aset aktif** (`INACTIVE_STATUSES` di
  `src/lib/constants.ts`), dan muncul terpisah di kartu "Pelepasan aset"
  (nilai dibuang, nilai dijual, hasil penjualan dari `soldPrice`).
- Server yang menyelaraskan metadata pelepasan: `toItemWriteData()` di
  `src/lib/action-utils.ts` membersihkan `disposedAt` / `disposalReason` bila
  status bukan `DISPOSED`, dan `soldAt` / `soldPrice` bila status bukan `SOLD`.
- Ekspor Excel (`/api/export`) memuat kolom tambahan: `Unit Pengelola`,
  `Cabang Lokasi`, `Sumber Perolehan`, `Cabang Pembeli`, `Pemilik Aset`,
  `Tanggal Dibuang`, `Alasan Dibuang`, `Tanggal Jual`, `Harga Jual`.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.


You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

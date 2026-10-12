# Catatan Lanjutan — Inventory List

Terakhir diperbarui: 12 Oktober 2026 (sesi lanjutan — halaman Sampah & pemulihan barang).
Stack: Next.js 16.4.0 (Turbopack, Cache Components aktif) + Prisma 7.10.0 + SQLite (`dev.db`).
Repositori: https://github.com/adamsyahmop/InventoryList (branch `main`, commit awal `823b402`).
Identitas git repo ini: `adamsyahmop` / `adamsyahmop@users.noreply.github.com` (noreply, agar email asli tidak terekspos); `.env.example` di-*unignore* lewat `!.env.example` supaya template tetap ikut ter-commit.

## Status: aplikasi JALAN dan TERVERIFIKASI ✅

`npm run build` hijau (13/13 halaman), `npm run lint` hijau, `npx tsc --noEmit`
hijau, `npm run seed` hijau, dan smoke test end-to-end
**157 pemeriksaan, 0 gagal**.

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
`/items?branchId=<id>`, `/items?acquisitionSource=BRANCH`,
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
- `/api/export`: `text/csv; charset=utf-8`, diawali `Kode,Nama`, header memuat
  `Cabang Lokasi,Sumber Perolehan,Cabang Pembeli,Pemilik Aset,Tanggal Dibuang,Alasan Dibuang,Tanggal Jual,Harga Jual`.

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
- **`error.tsx` / `global-error.tsx`.** Belum ada boundary error sama sekali;
  kegagalan Prisma tampil sebagai overlay dev / halaman bawaan di production.
  Pola yang sudah ada: `not-found.tsx` + `EmptyState` bisa ditiru.
- **Multi-user & peran.** Identitas pelaku masih literal: `movedBy: "admin"`
  (`src/lib/actions/items.ts:57`, `:119`, `:185`, `:246`) dan
  `createdBy: "admin"` (`:45`; sisi seed memakai `"seed"`). Sebelum ada model
  `User`, kumpulkan dulu semuanya jadi satu konstanta supaya satu titik ubah.

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

## Artefak

- `smoke.ps1` (root project) — skrip smoke test, **dipertahankan**.
- `dev.db` — database SQLite berisi data seed.
- `smoke.log` — output smoke test terakhir (boleh dihapus kapan saja).
- Server `next start -p 3100` dipakai untuk verifikasi sesi 9 Oktober 2026 dan
  12 Oktober 2026; matikan dengan `Stop-Process` bila sudah tidak dipakai.
  Perintah verifikasi lengkap (build → seed → "panaskan" cache → smoke):

  ```powershell
  npm run build
  npm run start -- -p 3100    # terminal terpisah
  npm run seed                # mengembalikan INV-2026-0010 ke kondisi terhapus
  # GET /items/terhapus dua kali (lihat catatan cache di bawah), lalu:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke.ps1
  ```

- Skrip debug sementara dari sesi 12 Oktober 2026 (`tmp-trash-debug.ps1`,
  `tmp-grep.ps1`, `tmp-warm.ps1`, `tmp-*.log`, `tmp-detail.html`) sudah
  **dihapus** — jangan commit file semacam itu; pakai `Get-Html`/`Submit-Action`
  di `smoke.ps1` kalau butuh membedah HTML.

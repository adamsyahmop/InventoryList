$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$base = 'http://localhost:3100'
$secret = 'dev-only-insecure-secret-change-me'

# Password login dibaca dari .env supaya skrip tidak perlu diubah saat password
# diganti. Fallback 'admin' sama dengan default di src/lib/session.ts.
$appPassword = 'admin'
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path -LiteralPath $envPath) {
  $envLine = Select-String -LiteralPath $envPath -Pattern '^\s*APP_PASSWORD\s*=\s*(.+?)\s*$' | Select-Object -First 1
  if ($envLine) { $appPassword = $envLine.Matches[0].Groups[1].Value.Trim('"').Trim("'") }
}

function Hit([string]$path, [string]$cookie) {
  $req = [System.Net.HttpWebRequest]::Create("$base$path")
  $req.AllowAutoRedirect = $false
  $req.Timeout = 30000
  if ($cookie) { $req.Headers.Add('Cookie', "inventory_session=$cookie") }
  try { $res = $req.GetResponse() } catch [System.Net.WebException] { $res = $_.Exception.Response }
  $code = [int]$res.StatusCode
  $loc = if ($res.Headers['Location']) { $res.Headers['Location'] } else { '' }
  $ct = if ($res.ContentType) { $res.ContentType } else { '' }
  $reader = New-Object System.IO.StreamReader($res.GetResponseStream())
  $body = $reader.ReadToEnd()
  $reader.Close(); $res.Close()
  $line = "{0,-50} {1,-4} {2,-24} {3,-26} len={4}" -f $path, $code, $loc, $ct, $body.Length
  [Console]::WriteLine($line)
  return [pscustomobject]@{ Code = $code; Location = $loc; ContentType = $ct; Body = $body }
}

$checks = @()
function Check([string]$label, $got, $want) {
  $script:checks += [pscustomobject]@{ Pass = ($got -eq $want); Label = $label; Got = "$got"; Want = "$want" }
}
# Ambil "N catatan, terbaru di atas." dari halaman detail. Dipakai untuk
# memastikan jumlah riwayat pergerakan bertambah tepat satu setelah pemulihan,
# sehingga pemeriksaan tetap kuat walau smoke dijalankan berulang kali.
function Get-MovementCount([string]$body) {
  $match = [regex]::Match($body, '(\d+)\s*catatan,\s*terbaru di atas')
  if ($match.Success) { return [int]$match.Groups[1].Value }
  return -1
}

function HasText([string]$label, [string]$body, [string]$needle, [bool]$want = $true) {
  $verb = if ($want) { 'memuat' } else { 'TIDAK memuat' }
  Check "$label $verb '$needle'" ($body.Contains($needle)) $want
}

# Login sungguhan lewat form server action (jalur progressive enhancement):
# React/Next menaruh id action + state awal di input hidden `$ACTION_*`, jadi
# POST multipart biasa cukup untuk menirukan submit tanpa JavaScript. Ini
# melatih `verifyPassword()` + `startSession()` di jalur nyata, bukan token
# HMAC yang dibuat sendiri.
function Submit-Login([string]$password) {
  $page = [System.Net.HttpWebRequest]::Create("$base/login")
  $page.AllowAutoRedirect = $false
  $pageRes = $page.GetResponse()
  $pageReader = New-Object System.IO.StreamReader($pageRes.GetResponseStream())
  $html = $pageReader.ReadToEnd()
  $pageReader.Close(); $pageRes.Close()

  $fields = [ordered]@{ '$ACTION_REF_1' = '' }
  foreach ($name in @('$ACTION_1:0', '$ACTION_1:1', '$ACTION_KEY')) {
    $match = [regex]::Match($html, '<input type="hidden" name="' + [regex]::Escape($name) + '" value="([^"]*)"')
    if (-not $match.Success) { throw "field $name tidak ditemukan di HTML /login" }
    $fields[$name] = $match.Groups[1].Value.Replace('&quot;', '"').Replace('&amp;', '&')
  }
  $fields['next'] = '/'
  $fields['password'] = $password

  $form = New-Object System.Net.Http.MultipartFormDataContent
  foreach ($key in $fields.Keys) {
    $part = New-Object System.Net.Http.StringContent([string]$fields[$key])
    $part.Headers.ContentDisposition = New-Object System.Net.Http.Headers.ContentDispositionHeaderValue('form-data')
    $part.Headers.ContentDisposition.Name = '"' + $key + '"'
    $form.Add($part)
  }

  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect = $false
  $client = New-Object System.Net.Http.HttpClient($handler)
  $response = $client.PostAsync("$base/login", $form).GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $cookie = ''
  if ($response.Headers.Contains('Set-Cookie')) {
    foreach ($raw in $response.Headers.GetValues('Set-Cookie')) {
      if ($raw -match '^inventory_session=([^;]+)') { $cookie = $Matches[1] }
    }
  }
  $location = ''
  if ($response.Headers.Contains('Location')) { $location = @($response.Headers.GetValues('Location'))[0] }
  $client.Dispose()

  $line = "{0,-50} {1,-4} {2,-24} {3,-26} len={4}" -f 'POST /login', [int]$response.StatusCode, $location, 'login', $body.Length
  [Console]::WriteLine($line)
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Location = $location; Cookie = $cookie; Body = $body }
}

# Ambil HTML sebuah halaman dengan cookie sesi, tanpa mencetak apa pun.
function Get-Html([string]$path, [string]$cookie) {
  $req = [System.Net.HttpWebRequest]::Create("$base$path")
  $req.AllowAutoRedirect = $false
  $req.Timeout = 30000
  if ($cookie) { $req.Headers.Add('Cookie', "inventory_session=$cookie") }
  try { $res = $req.GetResponse() } catch [System.Net.WebException] { $res = $_.Exception.Response }
  $reader = New-Object System.IO.StreamReader($res.GetResponseStream())
  $body = $reader.ReadToEnd()
  $reader.Close(); $res.Close()
  return $body
}

# Kirim form server action TANPA JavaScript (jalur progressive enhancement).
# React menaruh id action + state awal sebagai input hidden `$ACTION_*` di dalam
# <form>, jadi POST multipart biasa cukup untuk meniru submit. Dengan ini aksi
# `deleteItemAction` / `restoreItemAction` benar-benar dieksekusi, bukan hanya
# halamannya di-GET. Form dipilih lewat teks tombolnya, supaya tetap benar walau
# tombol Hapus dan Pulihkan sama-sama ada di satu halaman.
function Submit-Action([string]$path, [string]$buttonText, [string]$idContains, [string]$cookie) {
  $html = Get-Html $path $cookie
  $fields = $null
  foreach ($formMatch in [regex]::Matches($html, '(?s)<form\b.*?</form>')) {
    $chunk = $formMatch.Value
    if (-not $chunk.Contains('>' + $buttonText + '<')) { continue }
    if ($idContains -and -not $chunk.Contains($idContains)) { continue }
    $fields = [ordered]@{}
    foreach ($input in [regex]::Matches($chunk, '<input[^>]*type="hidden"[^>]*>')) {
      $tag = $input.Value
      $nameMatch = [regex]::Match($tag, 'name="([^"]*)"')
      if (-not $nameMatch.Success) { continue }
      $valueMatch = [regex]::Match($tag, 'value="([^"]*)"')
      $value = ''
      if ($valueMatch.Success) {
        $value = $valueMatch.Groups[1].Value.Replace('&quot;', '"').Replace('&amp;', '&')
      }
      $fields[$nameMatch.Groups[1].Value] = $value
    }
    break
  }
  if (-not $fields) { throw "form dengan tombol '$buttonText' tidak ditemukan di $path" }

  # Body multipart disusun manual dan dikirim lewat HttpWebRequest — sama seperti
  # `Hit()` — karena HttpClient mengabaikan header Cookie yang dipasang manual di
  # sini, sehingga request dianggap anonim dan proxy mengalihkannya ke /login.
  $boundary = '----smoke' + [Guid]::NewGuid().ToString('N')
  $builder = New-Object System.Text.StringBuilder
  foreach ($key in $fields.Keys) {
    [void]$builder.Append("--$boundary`r`n")
    [void]$builder.Append("Content-Disposition: form-data; name=`"$key`"`r`n`r`n")
    [void]$builder.Append([string]$fields[$key])
    [void]$builder.Append("`r`n")
  }
  [void]$builder.Append("--$boundary--`r`n")
  $bytes = [Text.Encoding]::UTF8.GetBytes($builder.ToString())

  $req = [System.Net.HttpWebRequest]::Create("$base$path")
  $req.Method = 'POST'
  $req.AllowAutoRedirect = $false
  $req.Timeout = 30000
  $req.ContentType = "multipart/form-data; boundary=$boundary"
  $req.ContentLength = $bytes.Length
  if ($cookie) { $req.Headers.Add('Cookie', "inventory_session=$cookie") }
  $stream = $req.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()

  try { $res = $req.GetResponse() } catch [System.Net.WebException] { $res = $_.Exception.Response }
  $code = [int]$res.StatusCode
  $location = if ($res.Headers['Location']) { $res.Headers['Location'] } else { '' }
  $reader = New-Object System.IO.StreamReader($res.GetResponseStream())
  $body = $reader.ReadToEnd()
  $reader.Close(); $res.Close()

  $line = "{0,-50} {1,-4} {2,-24} {3,-26} len={4}" -f "POST $path [$buttonText]", $code, $location, 'action', $body.Length
  [Console]::WriteLine($line)
  return [pscustomobject]@{ Code = $code; Location = $location; Body = $body }
}

$issuedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$sig = ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($issuedAt)) | ForEach-Object { $_.ToString('x2') }) -join ''
$token = "$issuedAt.$sig"

[Console]::WriteLine('=== TANPA COOKIE ===')
$anonRoot = Hit '/' $null
$anonItems = Hit '/items' $null
$anonExport = Hit '/api/export' $null
$login = Hit '/login' $null

[Console]::WriteLine('=== LOGIN (POST form server action) ===')
$loginOk = Submit-Login $appPassword
$loginBad = Submit-Login 'password-salah-pasti'
$dashViaLogin = Hit '/' $loginOk.Cookie

[Console]::WriteLine('=== DENGAN COOKIE SESI ===')
$dash = Hit '/' $token
$items = Hit '/items' $token
$itemsFiltered = Hit '/items?q=asus&status=AVAILABLE&sort=name_asc&page=1' $token
$itemsPaged = Hit '/items?page=1&sort=price_desc' $token
$newItem = Hit '/items/new' $token
$movements = Hit '/movements' $token
$master = Hit '/master' $token
$csv = Hit '/api/export' $token
$missingItem = Hit '/items/doesnotexist1234567890' $token
$missingItemEdit = Hit '/items/doesnotexist1234567890/edit' $token
$emptySearch = Hit '/items?q=zzzznothing' $token
$emptyStatus = Hit '/items?status=LOST' $token
$overflowPage = Hit '/items?page=999' $token
$missingRoute = Hit '/halaman-tidak-ada-xyz' $token

$itemId = $null
$m = [regex]::Match($items.Body, '/items/([A-Za-z0-9_-]{15,})')
if ($m.Success) { $itemId = $m.Groups[1].Value }
[Console]::WriteLine('')
if ($itemId) {
  [Console]::WriteLine("id barang terdeteksi: $itemId")
  $detail = Hit "/items/$itemId" $token
  $edit = Hit "/items/$itemId/edit" $token
} else {
  [Console]::WriteLine('PERINGATAN: id barang tidak ditemukan di HTML /items')
  $detail = $null; $edit = $null
}

# --- dimensi cabang & pelepasan aset -----------------------------------------
# Id cabang dibaca dari <select id="filter-branch"> di toolbar, jadi skrip tidak
# perlu tahu id-nya lebih dulu dan tetap valid walau database di-seed ulang.
$branchId = $null
$branchMatch = [regex]::Match($items.Body, '<option value="([A-Za-z0-9_-]{15,})">Cabang Bandung</option>')
if ($branchMatch.Success) { $branchId = $branchMatch.Groups[1].Value }

[Console]::WriteLine('')
$itemsByBranch = $null
if ($branchId) {
  [Console]::WriteLine("id cabang Bandung terdeteksi: $branchId")
  $itemsByBranch = Hit "/items?branchId=$branchId" $token
} else {
  [Console]::WriteLine('PERINGATAN: id cabang tidak ditemukan di HTML /items')
}

$itemsFromBranch = Hit '/items?acquisitionSource=BRANCH' $token
$itemsFromHead = Hit '/items?acquisitionSource=HEAD_OFFICE' $token

# `searchKey` menyertakan nama/kode cabang & alasan pembuangan, jadi pencarian
# teks biasa harus menemukan barangnya tanpa filter tambahan.
$itemsSearchBranch = Hit '/items?q=bandung' $token
$itemsSearchReason = Hit '/items?q=tidak%20ekonomis' $token

# Barang yang sudah dijual: id-nya dicari lewat pencarian kode.
$soldSearch = Hit '/items?q=INV-2026-0009' $token
# Kode contoh seed kini memakai akhiran jenis, jadi pencarian dengan kode utuh
# (`...-PC`) juga harus menemukan barangnya — bukti `searchKey` ikut diperbarui.
$soldSearchSuffix = Hit '/items?q=INV-2026-0009-PC' $token
$soldId = $null
$soldMatch = [regex]::Match($soldSearch.Body, '/items/([A-Za-z0-9_-]{15,})')
if ($soldMatch.Success) { $soldId = $soldMatch.Groups[1].Value }
$soldDetail = $null
if ($soldId) { $soldDetail = Hit "/items/$soldId" $token }

[Console]::WriteLine('')
# --- 404 & empty state -------------------------------------------------------
# `notFound()` di `/items/[id]` dipanggil setelah shell ter-stream, jadi status
# HTTP memang tetap 200 (perilaku resmi Next.js, bukan bug). Yang diverifikasi:
# UI not-found yang kita buat dirender, tag `noindex` disuntik Next.js, dan
# konten halaman asli tidak ikut terkirim.
Check 'auth GET /items/[id-tidak-ada] status' $missingItem.Code 200
HasText 'not-found' $missingItem.Body 'Barang tidak ditemukan'
HasText 'not-found' $missingItem.Body 'noindex'
HasText 'not-found' $missingItem.Body 'Data barang' $false
HasText 'not-found' $missingItem.Body 'Riwayat pergerakan' $false
Check 'auth GET /items/[id-tidak-ada]/edit status' $missingItemEdit.Code 200
HasText 'not-found-edit' $missingItemEdit.Body 'Barang tidak ditemukan'
HasText 'not-found-edit' $missingItemEdit.Body 'Simpan Perubahan' $false
Check 'auth GET /items?q=zzzznothing status' $emptySearch.Code 200
HasText 'items(q=zzzznothing)' $emptySearch.Body 'Belum ada barang yang cocok'
HasText 'items(q=zzzznothing)' $emptySearch.Body 'INV-2026-0001' $false
Check 'auth GET /items?status=LOST status' $emptyStatus.Code 200
HasText 'items(status=LOST)' $emptyStatus.Body 'Belum ada barang yang cocok'
Check 'auth GET /items?page=999 status' $overflowPage.Code 200
HasText 'items(page=999)' $overflowPage.Body 'Belum ada barang yang cocok'
# URL yang tidak cocok rute mana pun tidak streaming, jadi status 404 asli.
Check 'auth GET /halaman-tidak-ada status' $missingRoute.Code 404
HasText 'not-found-global' $missingRoute.Body 'Halaman tidak ditemukan'
HasText 'not-found-global' $missingRoute.Body 'This page could not be found' $false

[Console]::WriteLine('=== PEMERIKSAAN ===')
Check 'anon GET / status' $anonRoot.Code 307
Check 'anon GET / redirect ke /login' ($anonRoot.Location -like '*/login*') $true
Check 'anon GET /items status' $anonItems.Code 307
Check 'anon GET /items redirect' ($anonItems.Location -like '*/login*') $true
Check 'anon GET /api/export status' $anonExport.Code 307
Check 'GET /login status' $login.Code 200
HasText 'login' $login.Body 'type="password"'
HasText 'login' $login.Body 'Masukkan password untuk melanjutkan'

# Jalur login sungguhan (POST form server action), bukan token bikinan sendiri.
Check 'POST /login password benar status' $loginOk.Status 303
Check 'POST /login redirect ke /' $loginOk.Location '/'
Check 'POST /login set cookie sesi' ([bool]$loginOk.Cookie) $true
Check 'POST /login password salah status' $loginBad.Status 200
Check 'POST /login password salah tanpa cookie' ([bool]$loginBad.Cookie) $false
HasText 'login(gagal)' $loginBad.Body 'Password salah. Coba lagi.'
Check 'auth GET / dengan cookie hasil login' $dashViaLogin.Code 200
HasText 'dashboard(via login)' $dashViaLogin.Body '100.350.000'

Check 'auth GET / status' $dash.Code 200
Check 'auth GET /items status' $items.Code 200
Check 'auth GET /items?q=asus status' $itemsFiltered.Code 200
Check 'auth GET /items?sort=price_desc status' $itemsPaged.Code 200
Check 'auth GET /items/new status' $newItem.Code 200
Check 'auth GET /movements status' $movements.Code 200
Check 'auth GET /master status' $master.Code 200
Check 'auth GET /api/export status' $csv.Code 200
Check 'api/export content-type' $csv.ContentType 'text/csv; charset=utf-8'
Check 'api/export diawali Kode,Nama' $csv.Body.StartsWith('Kode,Nama') $true
Check 'api/export tanpa BOM mentah' $csv.Body.Contains('INV-2026-0001') $true

HasText 'dashboard' $dash.Body 'Jenis barang'
HasText 'dashboard' $dash.Body 'Nilai aset aktif'
HasText 'dashboard' $dash.Body 'Barang terbaru'
HasText 'dashboard' $dash.Body 'Garansi segera habis'
HasText 'dashboard' $dash.Body 'INV-2026-0008'
HasText 'dashboard' $dash.Body 'Rp'
# `price` = harga SATUAN, jadi nilai = SUM(price * quantity).
# 9 barang seed: perolehan 112.600.000; dibuang 1.850.000; dijual 10.400.000;
# nilai aset aktif 100.350.000 (bukan 33.850.000 yang hanya menjumlah harga satuan).
HasText 'dashboard' $dash.Body '112.600.000'
HasText 'dashboard' $dash.Body '100.350.000'
HasText 'dashboard' $dash.Body '1.850.000'
HasText 'dashboard' $dash.Body '10.400.000'
HasText 'dashboard' $dash.Body '3.500.000'
HasText 'dashboard' $dash.Body '33.850.000' $false
HasText 'dashboard' $dash.Body 'nilai perolehan'
HasText 'dashboard' $dash.Body 'Nilai aset aktif per cabang'
HasText 'dashboard' $dash.Body '3 cabang terdaftar'
HasText 'dashboard' $dash.Body 'Kantor pusat'
HasText 'dashboard' $dash.Body 'Cabang Bandung'
HasText 'dashboard' $dash.Body 'Cabang Surabaya'
HasText 'dashboard' $dash.Body 'Pelepasan aset'
HasText 'dashboard' $dash.Body 'Hasil penjualan'
HasText 'dashboard' $dash.Body 'Kategori terpakai'
HasText 'dashboard' $dash.Body 'dari 3 kategori terdaftar'
HasText 'dashboard' $dash.Body 'Perlu perhatian'
HasText 'dashboard' $dash.Body '1 perbaikan'
HasText 'dashboard' $dash.Body 'Porsi'
HasText 'dashboard' $dash.Body 'per pcs'
# Baris status & nama kategori kini bisa diklik ke daftar barang terfilter.
HasText 'dashboard' $dash.Body '/items?status=AVAILABLE'
HasText 'dashboard' $dash.Body '/items?categoryId='
HasText 'items' $items.Body '<table'
HasText 'items' $items.Body 'INV-2026-0001'
HasText 'items(q=asus)' $itemsFiltered.Body 'Router Asus RT-AX58U'
HasText 'items(q=asus)' $itemsFiltered.Body 'Latitude 5440' $false
HasText 'items(sort=price_desc)' $itemsPaged.Body '<table'
HasText 'items/new' $newItem.Body 'Tambah Barang'
HasText 'movements' $movements.Body 'Riwayat pergerakan terbaru'
HasText 'movements' $movements.Body 'catatan terakhir'
HasText 'movements' $movements.Body 'Gudang A'
HasText 'master' $master.Body 'MasterManager'
HasText 'master' $master.Body 'Unit kerja pemilik aset'
HasText 'master' $master.Body 'Kode cabang'
HasText 'master' $master.Body 'Cabang Bandung (BDG)'

# --- dimensi cabang ----------------------------------------------------------
HasText 'items' $items.Body 'Lokasi / cabang'
HasText 'items' $items.Body 'Cabang lokasi'
HasText 'items' $items.Body 'Gudang Bandung'
HasText 'items' $items.Body 'Kantor Pusat'
Check 'auth GET /items?branchId status' $itemsByBranch.Code 200
HasText 'items(branchId=Bandung)' $itemsByBranch.Body 'INV-2026-0005'
HasText 'items(branchId=Bandung)' $itemsByBranch.Body 'INV-2026-0001' $false
Check 'auth GET /items?acquisitionSource=BRANCH status' $itemsFromBranch.Code 200
HasText 'items(source=BRANCH)' $itemsFromBranch.Body 'INV-2026-0006'
HasText 'items(source=BRANCH)' $itemsFromBranch.Body 'INV-2026-0001' $false
Check 'auth GET /items?acquisitionSource=HEAD_OFFICE status' $itemsFromHead.Code 200
HasText 'items(source=HEAD_OFFICE)' $itemsFromHead.Body 'INV-2026-0001'
Check 'auth GET /items?q=bandung status' $itemsSearchBranch.Code 200
HasText 'items(q=bandung)' $itemsSearchBranch.Body 'INV-2026-0006'
HasText 'items(q=bandung)' $itemsSearchBranch.Body 'INV-2026-0001' $false
Check 'auth GET /items?q=tidak ekonomis status' $itemsSearchReason.Code 200
HasText 'items(q=tidak ekonomis)' $itemsSearchReason.Body 'INV-2026-0008'

# --- pelepasan aset ----------------------------------------------------------
Check 'auth GET /items?q=INV-2026-0009 status' $soldSearch.Code 200
HasText 'items(q=INV-2026-0009)' $soldSearch.Body 'Dijual'
if ($soldDetail) {
  Check 'auth GET /items/[id-dijual] status' $soldDetail.Code 200
  HasText 'detail-dijual' $soldDetail.Body 'Barang ini sudah'
  HasText 'detail-dijual' $soldDetail.Body 'tidak dihitung dalam nilai aset aktif'
  HasText 'detail-dijual' $soldDetail.Body 'Tanggal jual'
  HasText 'detail-dijual' $soldDetail.Body 'Pemilik aset'
  HasText 'detail-dijual' $soldDetail.Body 'Sumber perolehan'
  HasText 'detail-dijual' $soldDetail.Body 'Kantor Pusat'
} else {
  Check 'auth GET /items/[id-dijual] ditemukan' $false $true
}
if ($detail) {
  Check 'auth GET /items/[id] status' $detail.Code 200
  HasText 'detail' $detail.Body 'Riwayat pergerakan'
  HasText 'detail' $detail.Body 'Data barang'
  Check 'auth GET /items/[id]/edit status' $edit.Code 200
  HasText 'edit' $edit.Body 'Edit Barang'
}

# --- kode otomatis, jenis barang & label QR -----------------------------------
# Kode barang kini boleh dikosongkan: server yang membentuk
# `INV-<tahun>-<urut>-<jenis>`. Di sini semuanya diverifikasi lewat HTML (tanpa
# membuat barang) supaya smoke tidak mengubah data seed; pencetakan label diuji
# memakai barang pertama yang muncul di daftar.
[Console]::WriteLine('')
[Console]::WriteLine('=== KODE OTOMATIS, JENIS BARANG & LABEL QR ===')
$codeField = [regex]::Match($newItem.Body, '(?s)<input[^>]*id="code"[^>]*>')
Check 'items/new kolom kode ada' $codeField.Success $true
Check 'items/new kolom kode tidak wajib' $codeField.Value.Contains('required') $false
HasText 'items/new' $newItem.Body 'Kosongkan untuk dibuat otomatis'
HasText 'items/new' $newItem.Body 'Jenis barang'
HasText 'items/new' $newItem.Body '<option value="PC">'
HasText 'items/new' $newItem.Body '<option value="LPT">'
# Kode barang contoh di seed sudah ikut format baru (bersuffix jenis), dan nilai
# itu harus konsisten di daftar, ekspor CSV, serta pencarian berbasis searchKey.
HasText 'items' $items.Body 'INV-2026-0001-LPT'
Check 'api/export memuat kode bersuffix' ($csv.Body.Contains('INV-2026-0001-LPT')) $true
Check 'auth GET /items?q=INV-2026-0009-PC status' $soldSearchSuffix.Code 200
HasText 'items(q=INV-2026-0009-PC)' $soldSearchSuffix.Body 'PC Desktop HP ProDesk 400'

if ($detail) {
  HasText 'detail' $detail.Body 'Jenis barang'
  HasText 'detail' $detail.Body 'Label QR'
  HasText 'detail' $detail.Body 'Cetak label'
  HasText 'detail' $detail.Body "/items/$itemId/label"
  # QR dibuat server-side sebagai SVG inline, jadi halaman tidak boleh menunjuk
  # layanan gambar pihak ketiga.
  Check 'detail QR berupa <svg>' ($detail.Body.Contains('<svg')) $true
  Check 'detail QR tanpa layanan luar' ($detail.Body.Contains('qrserver') -or $detail.Body.Contains('chart.googleapis')) $false

  $label = Hit "/items/$itemId/label" $token
  Check 'auth GET /items/[id]/label status' $label.Code 200
  HasText 'label' $label.Body 'Inventaris Barang'
  Check 'label QR berupa <svg>' ($label.Body.Contains('<svg')) $true
  HasText 'label aturan cetak' $label.Body 'print-area'
  # SKU yang tercetak harus sama dengan yang tampil di halaman detail, dan QR
  # menyimpan URL detail (bukan kode) supaya label tetap sah walau kode/nama
  # barang nanti diubah.
  # Regex sengaja toleran dua format: kode contoh seed & kode terbitan server
  # bersuffix jenis (`INV-2026-0009-PC`), sedangkan kode lama/manual yang
  # diketik tanpa suffix (`INV-2026-0009`) tetap sah. Keduanya harus cocok.
  $detailCode = [regex]::Match($detail.Body, 'INV-\d{4}-\d{4}(-[A-Z]+)?').Value
  Check 'detail memuat kode barang' ($detailCode.Length -gt 0) $true
  HasText 'label memuat kode yang sama' $label.Body $detailCode
  HasText 'label tautan ke detail' $label.Body "/items/$itemId"
}

# --- Sampah: soft delete & pemulihan -----------------------------------------
# Menutup celah yang dulu membuat bug `getItem()` lolos: jalur hapus/pulihkan
# tidak pernah diuji. Seed menyediakan INV-2026-0010 yang sudah dihapus, dan di
# akhir bagian ini barang itu dikembalikan ke kondisi terhapus supaya angka
# dashboard tidak berubah.
[Console]::WriteLine('')
[Console]::WriteLine('=== SAMPAH (soft delete & pemulihan) ===')
$trash = Hit '/items/terhapus' $token
$trashIdContains = 'INV-2026-0010'
# Nama dipakai untuk memverifikasi kehadiran/ketiadaan di daftar aktif: kotak
# pencarian merender ulang kata kunci, jadi kode barang selalu ada di HTML
# halaman hasil pencarian walau barisnya sudah terhapus.
$trashName = 'Lemari Arsip Besi Lion'
$trashMatch = [regex]::Match($trash.Body, '/items/([A-Za-z0-9_-]{15,})')
$trashId = if ($trashMatch.Success) { $trashMatch.Groups[1].Value } else { $null }

Check 'auth GET /items/terhapus status' $trash.Code 200
HasText 'trash' $trash.Body 'Sampah'
HasText 'trash' $trash.Body 'Pemulihan mengembalikan statusnya ke Tersedia'
HasText 'trash' $trash.Body $trashIdContains
HasText 'trash' $trash.Body $trashName
HasText 'trash' $trash.Body 'Pulihkan'
# Kolom "Status terakhir": `deleteItemAction` memaksa DISPOSED saat menghapus,
# jadi yang tampil selalu "Dibuang" (status sebelum dihapus tidak disimpan).
HasText 'trash' $trash.Body 'Status terakhir'
HasText 'trash' $trash.Body 'Dibuang'
# Barang terhapus harus absen dari daftar aktif dan dari ekspor CSV.
HasText 'items(tanpa barang terhapus)' $items.Body $trashName $false
HasText 'csv(tanpa barang terhapus)' $csv.Body $trashIdContains $false
# Navigasi hanya boleh menandai SATU menu aktif: `/items/terhapus` tidak boleh
# ikut menyalakan menu `/items` (aturan prefix terpanjang di app-nav.tsx).
Check 'nav aktif tunggal di /items/terhapus' ([regex]::Matches($trash.Body, 'aria-current="page"').Count) 1
Check 'nav aktif tunggal di /items' ([regex]::Matches($items.Body, 'aria-current="page"').Count) 1

if ($trashId) {
  [Console]::WriteLine("id barang terhapus: $trashId")
  $trashDetail = Hit "/items/$trashId" $token
  $trashEdit = Hit "/items/$trashId/edit" $token

  Check 'auth GET /items/[id-terhapus] status' $trashDetail.Code 200
  # Teks alert dicari dengan awalan "Barang ini" — kalimat halaman not-found
  # bawaan Next.js ("...atau sudah dihapus dari daftar aktif...") selalu ikut
  # ter-embed di payload RSC rute ini, jadi potongan yang lebih pendek salah.
  HasText 'detail-terhapus' $trashDetail.Body 'Barang ini sudah dihapus'
  HasText 'detail-terhapus' $trashDetail.Body 'Pulihkan'
  # Konteks penghapusan tetap terbaca dari halaman detailnya.
  HasText 'detail-terhapus' $trashDetail.Body 'Rusak berat'
  HasText 'detail-terhapus' $trashDetail.Body 'Alasan dibuang'
  # Barang di Sampah tidak bisa disunting dan tidak punya form pergerakan.
  HasText 'detail-terhapus' $trashDetail.Body "/items/$trashId/edit" $false
  HasText 'detail-terhapus' $trashDetail.Body 'Catat pergerakan' $false

  # `notFound()` dipanggil setelah shell ter-stream, jadi status HTTP tetap 200
  # (perilaku Next.js); yang diverifikasi adalah UI not-found yang dirender.
  Check 'auth GET /items/[id-terhapus]/edit status' $trashEdit.Code 200
  HasText 'edit-terhapus' $trashEdit.Body 'Barang tidak ditemukan'
  HasText 'edit-terhapus' $trashEdit.Body 'Simpan Perubahan' $false

  # Pulihkan lewat form di halaman Sampah (tanpa JavaScript). Respons action ini
  # adalah render ulang halaman Sampah, jadi tabelnya harus sudah tanpa barang.
  $movesBefore = Get-MovementCount $trashDetail.Body
  Check 'detail-terhapus memuat jumlah riwayat' ($movesBefore -ge 0) $true
  $restore = Submit-Action '/items/terhapus' 'Pulihkan' $trashId $token
  Check 'POST /items/terhapus [Pulihkan] status' $restore.Code 200
  HasText 'POST pulihkan' $restore.Body $trashIdContains $false
  HasText 'POST pulihkan' $restore.Body 'Sampah kosong'

  $itemsAfterRestore = Hit "/items?q=$trashIdContains" $token
  $trashAfterRestore = Hit '/items/terhapus' $token
  $detailAfterRestore = Hit "/items/$trashId" $token
  $movementsAfterRestore = Hit '/movements' $token

  HasText 'items(setelah pulih)' $itemsAfterRestore.Body $trashName
  HasText 'items(setelah pulih)' $itemsAfterRestore.Body $trashIdContains
  HasText 'trash(setelah pulih)' $trashAfterRestore.Body $trashIdContains $false
  # Sampah jadi kosong lagi, sekaligus menguji empty state-nya.
  HasText 'trash(setelah pulih)' $trashAfterRestore.Body 'Sampah kosong'
  HasText 'detail(setelah pulih)' $detailAfterRestore.Body 'Barang ini sudah dihapus' $false
  HasText 'detail(setelah pulih)' $detailAfterRestore.Body 'Catat pergerakan'
  # Riwayat audit pemulihan ditulis di dalam transaksi yang sama. Jumlah catatan
  # di halaman detail harus bertambah TEPAT SATU — sekadar "memuat teks" tidak
  # cukup, karena baris audit dari run smoke sebelumnya masih tersimpan.
  HasText 'detail(setelah pulih)' $detailAfterRestore.Body 'Pemulihan dari Sampah'
  Check 'riwayat detail bertambah satu setelah pulih' (Get-MovementCount $detailAfterRestore.Body) ($movesBefore + 1)
  HasText 'movements(setelah pulih)' $movementsAfterRestore.Body 'Pemulihan dari Sampah'

  # Hapus lagi supaya isi Sampah & angka dashboard kembali seperti kondisi seed.
  $remove = Submit-Action "/items/$trashId" 'Hapus' $trashId $token
  Check 'POST /items/[id] [Hapus] status' $remove.Code 200
  HasText 'POST hapus' $remove.Body 'Barang ini sudah dihapus'

  $trashAfterDelete = Hit '/items/terhapus' $token
  $itemsAfterDelete = Hit "/items?q=$trashIdContains" $token
  HasText 'trash(setelah hapus lagi)' $trashAfterDelete.Body $trashIdContains
  HasText 'trash(setelah hapus lagi)' $trashAfterDelete.Body 'Pulihkan'
  HasText 'items(setelah hapus lagi)' $itemsAfterDelete.Body $trashName $false
} else {
  Check 'auth GET /items/terhapus memuat barang terhapus' $false $true
}

[Console]::WriteLine('')
foreach ($c in $checks) {
  if ($c.Pass) { "PASS  {0}" -f $c.Label }
  else { "FAIL  {0}  (got='{1}' want='{2}')" -f $c.Label, $c.Got, $c.Want }
}
$failed = @($checks | Where-Object { -not $_.Pass }).Count
[Console]::WriteLine('')
[Console]::WriteLine("TOTAL: $($checks.Count) pemeriksaan, $failed gagal")
if ($failed -gt 0) { exit 1 }

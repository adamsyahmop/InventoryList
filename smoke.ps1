$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
# Berkas .xlsx adalah arsip ZIP, jadi isinya diperiksa lewat System.IO.Compression.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base = 'http://localhost:3100'
$secret = '3aec7dcfe2f974af6fb2ef83f066a35e68fbc53604830a68e09839525c1818e5'

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

# Id sebuah baris data master dari HTML /master. Id diambil dari input hidden
# `name="id"` di dalam form Hapus baris itu, dan barisnya dikenali dari label
# (teks `text-neutral-800`), bukan dari urutan — supaya tetap benar walau data
# seed berubah urutannya.
function Get-MasterRowId([string]$body, [string]$label) {
  foreach ($m in [regex]::Matches($body, '(?s)<li class="py-2">(.*?)</li>')) {
    $chunk = $m.Groups[1].Value
    $labelMatch = [regex]::Match($chunk, 'text-neutral-800">([^<]*)<')
    if (-not $labelMatch.Success -or $labelMatch.Groups[1].Value -ne $label) { continue }
    $idMatch = [regex]::Match($chunk, 'name="id" value="([^"]+)"')
    if ($idMatch.Success) { return $idMatch.Groups[1].Value }
  }
  return ''
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

# Ambil berkas biner (foto) dengan cookie sesi. Tidak seperti `Hit()`, isinya
# TIDAK diubah menjadi teks: foto diuji utuh byte-nya.
function Get-Binary([string]$path, [string]$cookie) {
  $req = [System.Net.HttpWebRequest]::Create("$base$path")
  $req.AllowAutoRedirect = $false
  $req.Timeout = 30000
  if ($cookie) { $req.Headers.Add('Cookie', "inventory_session=$cookie") }
  try { $res = $req.GetResponse() } catch [System.Net.WebException] { $res = $_.Exception.Response }
  $code = [int]$res.StatusCode
  $ct = if ($res.ContentType) { $res.ContentType } else { '' }
  $bytes = @()
  if ($code -eq 200) {
    $memory = New-Object System.IO.MemoryStream
    $res.GetResponseStream().CopyTo($memory)
    $bytes = $memory.ToArray()
    $memory.Dispose()
  }
  $res.Close()
  $line = "{0,-50} {1,-4} {2,-24} {3,-26} bytes={4}" -f $path, $code, '', $ct, $bytes.Length
  [Console]::WriteLine($line)
  return [pscustomobject]@{ Code = $code; ContentType = $ct; Bytes = $bytes }
}

# Nilai field form barang dibaca dari HTML-nya sendiri: React menuliskan nilai
# awal input sebagai atribut `value`, menandai <option> terpilih dengan
# `selected`, dan isi <textarea> di antara tag. Dengan itu form bisa dikirim
# ulang apa adanya — menyimpan ulang tidak boleh menghapus data yang tidak
# sedang diuji.
#
# Checkbox sengaja dilewati (mis. `removePhoto`): yang tidak dicentang tidak
# dikirim browser, jadi menyalinnya sebagai teks akan mengubah arti form.
function Get-ItemFormValues([string]$html) {
  $values = @{}
  foreach ($match in [regex]::Matches($html, '<input[^>]*name="([^"]+)"[^>]*>')) {
    $tag = $match.Value
    if ($tag.Contains('type="file"') -or $tag.Contains('type="checkbox"')) { continue }
    $name = $match.Groups[1].Value
    if ($name.StartsWith('$ACTION')) { continue }
    $valueMatch = [regex]::Match($tag, 'value="([^"]*)"')
    $value = ''
    if ($valueMatch.Success) {
      $value = $valueMatch.Groups[1].Value.Replace('&quot;', '"').Replace('&#x27;', "'").Replace('&amp;', '&')
    }
    $values[$name] = $value
  }
  foreach ($match in [regex]::Matches($html, '(?s)<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>')) {
    $selected = [regex]::Match($match.Groups[2].Value, '<option value="([^"]*)"[^>]*selected')
    $values[$match.Groups[1].Value] = if ($selected.Success) { $selected.Groups[1].Value } else { '' }
  }
  foreach ($match in [regex]::Matches($html, '(?s)<textarea[^>]*name="([^"]+)"[^>]*>(.*?)</textarea>')) {
    $values[$match.Groups[1].Value] = $match.Groups[2].Value.Replace('&lt;', '<').Replace('&gt;', '>').Replace('&amp;', '&')
  }
  return $values
}

# Satu nilai baris "Data barang" di halaman detail, mis. label "Kategori".
function Get-DetailValue([string]$html, [string]$label) {
  $match = [regex]::Match($html, '(?s)<dt[^>]*>\s*' + [regex]::Escape($label) + '\s*</dt>\s*<dd[^>]*>(.*?)</dd>')
  if ($match.Success) { return $match.Groups[1].Value.Trim() }
  return ''
}

# Kirim form server action TANPA JavaScript (jalur progressive enhancement).
# React menaruh id action + state awal sebagai input hidden `$ACTION_*` di dalam
# <form>, jadi POST multipart biasa cukup untuk meniru submit. Dengan ini aksi
# `deleteItemAction` / `restoreItemAction` benar-benar dieksekusi, bukan hanya
# halamannya di-GET. Form dipilih lewat teks tombolnya, supaya tetap benar walau
# tombol Hapus dan Pulihkan sama-sama ada di satu halaman.
function Submit-Action([string]$path, [string]$buttonText, [string]$idContains, [string]$cookie, [hashtable]$overrides = @{}, [hashtable]$file = @{}) {
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
  # Form data master punya input teks/select yang terlihat (bukan hidden), jadi
  # nilainya tidak ikut terbaca dari HTML. `$overrides` mengisi field itu supaya
  # skrip benar-benar menyimpan/menghapus baris master, bukan mengirim form kosong.
  foreach ($key in $overrides.Keys) { $fields[$key] = [string]$overrides[$key] }

  # Body multipart disusun manual dan dikirim lewat HttpWebRequest — sama seperti
  # `Hit()` — karena HttpClient mengabaikan header Cookie yang dipasang manual di
  # sini, sehingga request dianggap anonim dan proxy mengalihkannya ke /login.
  # Field teks disusun sebagai string, sedangkan bagian berkas (`$file`) ditulis
  # sebagai byte mentah lewat MemoryStream — isinya biner, jadi tidak boleh
  # melewati StringBuilder/UTF-8 seperti field teks.
  $boundary = '----smoke' + [Guid]::NewGuid().ToString('N')
  $builder = New-Object System.Text.StringBuilder
  foreach ($key in $fields.Keys) {
    [void]$builder.Append("--$boundary`r`n")
    [void]$builder.Append("Content-Disposition: form-data; name=`"$key`"`r`n`r`n")
    [void]$builder.Append([string]$fields[$key])
    [void]$builder.Append("`r`n")
  }
  $bodyStream = New-Object System.IO.MemoryStream
  $headBytes = [Text.Encoding]::UTF8.GetBytes($builder.ToString())
  $bodyStream.Write($headBytes, 0, $headBytes.Length)
  foreach ($name in $file.Keys) {
    $part = $file[$name]
    $partHead = "--$boundary`r`n" +
      "Content-Disposition: form-data; name=`"$name`"; filename=`"$($part.FileName)`"`r`n" +
      "Content-Type: $($part.ContentType)`r`n`r`n"
    $partHeadBytes = [Text.Encoding]::UTF8.GetBytes($partHead)
    $bodyStream.Write($partHeadBytes, 0, $partHeadBytes.Length)
    $partBytes = [IO.File]::ReadAllBytes($part.Path)
    $bodyStream.Write($partBytes, 0, $partBytes.Length)
    $crlf = [Text.Encoding]::UTF8.GetBytes("`r`n")
    $bodyStream.Write($crlf, 0, $crlf.Length)
  }
  $tailBytes = [Text.Encoding]::UTF8.GetBytes("--$boundary--`r`n")
  $bodyStream.Write($tailBytes, 0, $tailBytes.Length)
  $bytes = $bodyStream.ToArray()
  $bodyStream.Dispose()

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

# Ekspor kini berupa berkas .xlsx (arsip ZIP), jadi isinya tidak bisa dibaca
# sebagai teks seperti CSV dulu. Berkas diunduh ke file sementara lalu diperiksa
# lewat ZipFile: nama sheet dari `xl/workbook.xml`, seluruh teks sel dari
# `xl/sharedStrings.xml`, dan format angka dari `xl/styles.xml`.
function Get-Export([string]$cookie) {
  $file = Join-Path $env:TEMP 'smoke-export.xlsx'
  $req = [System.Net.HttpWebRequest]::Create("$base/api/export")
  $req.AllowAutoRedirect = $false
  $req.Timeout = 30000
  if ($cookie) { $req.Headers.Add('Cookie', "inventory_session=$cookie") }
  try { $res = $req.GetResponse() } catch [System.Net.WebException] { $res = $_.Exception.Response }
  $code = [int]$res.StatusCode
  $ct = if ($res.ContentType) { $res.ContentType } else { '' }
  $disp = if ($res.Headers['Content-Disposition']) { $res.Headers['Content-Disposition'] } else { '' }
  $length = 0
  if ($code -eq 200) {
    $target = [System.IO.File]::Create($file)
    $res.GetResponseStream().CopyTo($target)
    $target.Close()
    $length = (Get-Item -LiteralPath $file).Length
  }
  $res.Close()
  $line = "{0,-50} {1,-4} {2,-24} {3,-26} len={4}" -f '/api/export', $code, '', $ct, $length
  [Console]::WriteLine($line)
  return [pscustomobject]@{ Code = $code; ContentType = $ct; Disposition = $disp; File = $file; Length = $length }
}

# Ambil satu berkas di dalam arsip .xlsx; '' bila tidak ada.
function Read-ZipEntry([string]$zipPath, [string]$entryName) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entry = $zip.GetEntry($entryName)
    if (-not $entry) { return '' }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $text = $reader.ReadToEnd()
    $reader.Close()
    return $text
  } finally { $zip.Dispose() }
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
$export = Get-Export $token
# Dibaca sekali di sini lalu dipakai beberapa pemeriksaan di bawah.
$exportSheets = Read-ZipEntry $export.File 'xl/workbook.xml'
$exportText = Read-ZipEntry $export.File 'xl/sharedStrings.xml'
$exportStyles = Read-ZipEntry $export.File 'xl/styles.xml'
# Sheet tahun pertama selalu sheet2 (sheet1 = Ringkasan); dipakai untuk menguji
# bahwa tanggal ditulis sebagai tanggal Excel, bukan teks.
$exportYearSheet = Read-ZipEntry $export.File 'xl/worksheets/sheet2.xml'
$missingItem = Hit '/items/doesnotexist1234567890' $token
$missingItemEdit = Hit '/items/doesnotexist1234567890/edit' $token
$emptySearch = Hit '/items?q=zzzznothing' $token
$emptyStatus = Hit '/items?status=LOST' $token
$overflowPage = Hit '/items?page=999' $token
$missingRoute = Hit '/halaman-tidak-ada-xyz' $token

$itemId = $null
# `href="` wajib disertakan: HTML mode dev juga memuat path modul klien
# (mis. `src/components/items/restore-item-button.tsx`) yang ikut cocok dengan
# pola id, dan urutannya bergantung pada waktu kompilasi dev server.
$m = [regex]::Match($items.Body, 'href="/items/([A-Za-z0-9_-]{15,})"')
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

# --- dimensi unit pengelola ---------------------------------------------------
# Id unit dibaca dari <select id="filter-department"> di toolbar /items supaya
# skrip tidak perlu tahu id yang dihasilkan database dan tetap valid setelah
# seed ulang. Unit "IT" dipilih karena barang seed INV-2026-0001 memakainya.
$departmentId = $null
$departmentMatch = [regex]::Match($items.Body, '<option value="([A-Za-z0-9_-]{15,})">IT</option>')
if ($departmentMatch.Success) { $departmentId = $departmentMatch.Groups[1].Value }

[Console]::WriteLine('')
$itemsByDepartment = $null
if ($departmentId) {
  [Console]::WriteLine("id unit pengelola IT terdeteksi: $departmentId")
  $itemsByDepartment = Hit "/items?departmentId=$departmentId" $token
} else {
  [Console]::WriteLine('PERINGATAN: id unit pengelola tidak ditemukan di HTML /items')
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
$soldMatch = [regex]::Match($soldSearch.Body, 'href="/items/([A-Za-z0-9_-]{15,})"')
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
Check 'auth GET /api/export status' $export.Code 200
Check 'api/export content-type xlsx' $export.ContentType 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
Check 'api/export nama berkas .xlsx' ($export.Disposition -like '*.xlsx*') $true
# Berkas .xlsx wajib berupa arsip ZIP: empat byte pertama adalah "PK\3\4".
$exportMagic = [Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($export.File)[0..3])
Check 'api/export berupa arsip ZIP' $exportMagic "PK$([char]3)$([char]4)"
Check 'api/export punya sheet Ringkasan' ($exportSheets.Contains('name="Ringkasan"')) $true
# Sheet per tahun diambil dari kode barang: seed memakai INV-2026-… → sheet 2026.
Check 'api/export punya sheet tahun dari kode' ($exportSheets.Contains('name="2026"')) $true
Check 'api/export tanpa sheet tahun palsu' ($exportSheets.Contains('name="Tanpa Tahun"')) $false
Check 'api/export memuat kode barang' ($exportText.Contains('INV-2026-0001')) $true
Check 'api/export memuat baris TOTAL' ($exportText.Contains('TOTAL (')) $true
# Harga & tanggal memakai format Excel asli, bukan teks, supaya bisa dijumlah
# dan diurutkan langsung di Excel.
Check 'api/export format rupiah Excel' ($exportStyles.Contains('&quot;Rp&quot;#,##0')) $true
Check 'api/export format tanggal Excel' ($exportStyles.Contains('dd/mm/yyyy')) $true
Check 'api/export tanggal beli berupa tanggal' ([regex]::IsMatch($exportYearSheet, '<c r="K2"[^>]*><v>[\d.]+</v>')) $true

HasText 'dashboard' $dash.Body 'Jenis barang'
# Kartu depan kini memakai JUMLAH aset aktif, bukan nilai rupiahnya.
HasText 'dashboard' $dash.Body 'Barang aktif'
HasText 'dashboard' $dash.Body '31 unit masih dimiliki'
HasText 'dashboard' $dash.Body 'Barang per cabang'
HasText 'dashboard' $dash.Body 'stroke-dasharray'
HasText 'dashboard' $dash.Body 'jenis barang'
HasText 'dashboard' $dash.Body 'Barang terbaru'
HasText 'dashboard' $dash.Body 'Garansi segera habis'
HasText 'dashboard' $dash.Body 'INV-2026-0008'
HasText 'dashboard' $dash.Body 'Rp'
# `price` = harga SATUAN, jadi nilai = SUM(price * quantity).
# 9 barang seed: perolehan 112.600.000; dibuang 1.850.000; dijual 10.400.000;
# nilai aset aktif 100.350.000 (bukan 33.850.000 yang hanya menjumlah harga satuan).
HasText 'dashboard' $dash.Body '112.600.000'
HasText 'dashboard' $dash.Body '100.350.000'
# Total nilai aset aktif kini tampil sebagai baris "Total" di tabel per cabang.
HasText 'dashboard' $dash.Body '<tfoot'
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

# --- hapus data master: penjagaan referensi (Tier A #2) -----------------------
# Semua relasi master memakai `onDelete: SetNull`, jadi hapus TANPA penjagaan
# menihilkan referensi secara diam-diam: barang kehilangan kategori/lokasi,
# riwayat pergerakan kehilangan nama lokasi, dan `searchKey` barang masih memuat
# nama yang sudah lenyap. Yang diuji di sini adalah jalur nyatanya — POST form
# server action tanpa JavaScript — yaitu baris yang masih dipakai DITOLAK dengan
# jumlah pemakaian yang terbaca di HTML, sementara baris yang tidak dipakai tetap
# bisa dihapus.
$categoryId = Get-MasterRowId $master.Body 'Elektronik'
$locationId = Get-MasterRowId $master.Body 'Gudang A'
$branchId = Get-MasterRowId $master.Body 'Kantor Pusat'
Check 'master id kategori Elektronik ditemukan' ($categoryId -ne '') $true
Check 'master id lokasi Gudang A ditemukan' ($locationId -ne '') $true
Check 'master id cabang Kantor Pusat ditemukan' ($branchId -ne '') $true

if ($categoryId) {
  $deniedCategory = Submit-Action '/master' 'Hapus' $categoryId $token
  Check 'POST /master [Hapus kategori dipakai] status' $deniedCategory.Code 200
  Check 'hapus kategori: jumlah barang tampil' ([regex]::IsMatch($deniedCategory.Body, 'Kategori ini masih dipakai oleh \d+ barang\.')) $true
  HasText 'hapus kategori' $deniedCategory.Body 'Pindahkan atau ganti referensinya dulu sebelum menghapus.'
  # Pesannya wajib jadi Alert: tanpa teks yang terbaca, penolakan tampak seperti
  # tombol yang tidak bekerja.
  HasText 'hapus kategori' $deniedCategory.Body 'role="alert"'
  Check 'kategori yang dipakai tidak terhapus' (Get-MasterRowId (Hit '/master' $token).Body 'Elektronik') $categoryId
}

if ($locationId) {
  $deniedLocation = Submit-Action '/master' 'Hapus' $locationId $token
  Check 'POST /master [Hapus lokasi dipakai] status' $deniedLocation.Code 200
  Check 'hapus lokasi: jumlah barang & pergerakan tampil' ([regex]::IsMatch($deniedLocation.Body, 'Lokasi ini masih dipakai oleh \d+ barang, \d+ pergerakan\.')) $true
  # Lokasi yang muncul di riwayat pergerakan dapat nasihat berbeda: jejak audit
  # tidak boleh kehilangan tempat asal/tujuan barang.
  HasText 'hapus lokasi' $deniedLocation.Body 'Riwayat pergerakan tidak boleh kehilangan lokasi.'
  HasText 'hapus lokasi' $deniedLocation.Body 'role="alert"'
  Check 'lokasi yang dipakai tidak terhapus' (Get-MasterRowId (Hit '/master' $token).Body 'Gudang A') $locationId
}

if ($branchId) {
  $deniedBranch = Submit-Action '/master' 'Hapus' $branchId $token
  Check 'POST /master [Hapus cabang dipakai] status' $deniedBranch.Code 200
  Check 'hapus cabang: jumlah barang & lokasi tampil' ([regex]::IsMatch($deniedBranch.Body, 'Cabang ini masih dipakai oleh \d+ barang, \d+ lokasi\.')) $true
  HasText 'hapus cabang' $deniedBranch.Body 'role="alert"'
  Check 'cabang yang dipakai tidak terhapus' (Get-MasterRowId (Hit '/master' $token).Body 'Kantor Pusat') $branchId
}

# Baris yang TIDAK dipakai tetap bisa dihapus. Baris sementara di bawah dibuat
# lalu dihapus lagi di bagian yang sama, jadi isi database kembali seperti semula.
$tmpCategory = 'ZZ-Smoke-Kategori'
$createCategory = Submit-Action '/master' 'Tambah' 'id="Kategori-name"' $token @{ name = $tmpCategory; code = 'ZZSMOKE'; description = '' }
Check 'POST /master [Tambah kategori] status' $createCategory.Code 200
HasText 'tambah kategori' $createCategory.Body 'Kategori ditambahkan.'
$tmpCategoryId = Get-MasterRowId (Hit '/master' $token).Body $tmpCategory
Check 'kategori sementara muncul di daftar' ($tmpCategoryId -ne '') $true
if ($tmpCategoryId) {
  $removeCategory = Submit-Action '/master' 'Hapus' $tmpCategoryId $token
  Check 'POST /master [Hapus kategori tak dipakai] status' $removeCategory.Code 200
  HasText 'hapus kategori tak dipakai' $removeCategory.Body 'Kategori dihapus.'
  Check 'kategori sementara hilang dari daftar' (Get-MasterRowId (Hit '/master' $token).Body $tmpCategory) ''
}

# Rujukan TIDAK LANGSUNG: cabang tanpa barang tetap ditolak selama masih ada
# lokasi yang menunjuk ke sana (`Location.branchId`).
$tmpBranch = 'ZZ-Smoke-Cabang'
$tmpLocation = 'ZZ-Smoke-Lokasi'
$createBranch = Submit-Action '/master' 'Tambah' 'id="Cabang-name"' $token @{ name = $tmpBranch; code = 'ZZSMOKE'; notes = '' }
HasText 'tambah cabang' $createBranch.Body 'Cabang ditambahkan.'
$tmpBranchId = Get-MasterRowId (Hit '/master' $token).Body $tmpBranch
Check 'cabang sementara muncul di daftar' ($tmpBranchId -ne '') $true
if ($tmpBranchId) {
  $createLocation = Submit-Action '/master' 'Tambah' 'id="Lokasi-name"' $token @{ name = $tmpLocation; building = ''; floor = ''; room = ''; branchId = $tmpBranchId; notes = '' }
  HasText 'tambah lokasi' $createLocation.Body 'Lokasi ditambahkan.'
  $tmpLocationId = Get-MasterRowId (Hit '/master' $token).Body $tmpLocation
  Check 'lokasi sementara muncul di daftar' ($tmpLocationId -ne '') $true
  if ($tmpLocationId) {
    $deniedTmpBranch = Submit-Action '/master' 'Hapus' $tmpBranchId $token
    Check 'cabang sementara ditolak karena 1 lokasi' ([regex]::IsMatch($deniedTmpBranch.Body, 'Cabang ini masih dipakai oleh 1 lokasi\.')) $true
    HasText 'hapus lokasi sementara' (Submit-Action '/master' 'Hapus' $tmpLocationId $token).Body 'Lokasi dihapus.'
    HasText 'hapus cabang sementara' (Submit-Action '/master' 'Hapus' $tmpBranchId $token).Body 'Cabang dihapus.'
    Check 'cabang sementara hilang dari daftar' (Get-MasterRowId (Hit '/master' $token).Body $tmpBranch) ''
  }
}

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

# --- dimensi unit pengelola ---------------------------------------------------
# Unit pengelola adalah sumbu tersendiri: filter IT harus menyisakan barang IT
# saja (0001), bukan barang GA (0005). Ini sekaligus membuktikan nilai
# `departmentId` benar-benar tersimpan dan dipakai oleh `listItems()`.
HasText 'items' $items.Body 'Unit pengelola'
HasText 'items' $items.Body 'filter-department'
if ($departmentId) {
  Check 'auth GET /items?departmentId status' $itemsByDepartment.Code 200
  HasText 'items(departmentId=IT)' $itemsByDepartment.Body 'INV-2026-0001'
  HasText 'items(departmentId=IT)' $itemsByDepartment.Body 'INV-2026-0005' $false
} else {
  Check 'auth GET /items?departmentId id unit ditemukan' $false $true
}
HasText 'master' $master.Body 'Unit pengelola'
HasText 'master' $master.Body 'Nama unit'
HasText 'master' $master.Body 'Kode unit'
HasText 'master' $master.Body 'General Affairs'
Check 'api/export memuat kolom unit pengelola' ($exportText.Contains('Unit Pengelola')) $true
Check 'api/export memuat nilai unit pengelola' ($exportText.Contains('IT (IT)')) $true

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
  HasText 'detail' $detail.Body 'Unit pengelola'
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
# itu harus konsisten di daftar, ekspor Excel, serta pencarian berbasis searchKey.
HasText 'items' $items.Body 'INV-2026-0001-LPT'
Check 'api/export memuat kode bersuffix' ($exportText.Contains('INV-2026-0001-LPT')) $true
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
# Anchor `href="` seperti di bagian awal, supaya path modul klien pada payload
# dev tidak pernah disalahartikan sebagai id barang.
$trashMatch = [regex]::Match($trash.Body, 'href="/items/([A-Za-z0-9_-]{15,})"')
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
# Barang terhapus harus absen dari daftar aktif dan dari ekspor Excel.
HasText 'items(tanpa barang terhapus)' $items.Body $trashName $false
HasText 'xlsx(tanpa barang terhapus)' $exportText $trashIdContains $false
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

# --- Foto barang --------------------------------------------------------------
# Foto disimpan sebagai berkas di `uploads/items` (di luar `public/`) dan
# disajikan lewat route handler sendiri yang memeriksa sesi. Yang diuji di sini
# adalah jalur nyatanya: unggah multipart berisi berkas biner lewat form di
# halaman detail (tanpa JavaScript), penyajian kembali berkasnya, penolakan
# berkas yang bukan gambar/terlalu besar, dan pembersihan saat foto dihapus.
# Barang ujinya dipilih di bawah (barang pertama yang belum punya foto), dan di
# akhir bagian ini fotonya dihapus lagi —
# jadi isi database & folder unggahan kembali seperti semula.
[Console]::WriteLine('')
[Console]::WriteLine('=== FOTO BARANG ===')

$photoFile = Join-Path $env:TEMP 'smoke-photo.jpg'
# JPEG 1x1 px (160 byte) — cukup untuk membuktikan berkas biner sampai utuh.
[IO.File]::WriteAllBytes($photoFile, [Convert]::FromBase64String(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
))
$photoFixture = [IO.File]::ReadAllBytes($photoFile)
Check 'berkas uji foto berformat JPEG' (($photoFixture[0] -eq 0xFF) -and ($photoFixture[1] -eq 0xD8) -and ($photoFixture[$photoFixture.Length - 1] -eq 0xD9)) $true

$textFile = Join-Path $env:TEMP 'smoke-not-a-photo.txt'
[IO.File]::WriteAllText($textFile, 'ini bukan gambar')
# 5,2 MB: di atas batas foto (5 MB) tetapi masih di bawah batas body Server
# Action (6 MB), jadi yang diuji memang validasi ukuran milik aplikasi.
$bigFile = Join-Path $env:TEMP 'smoke-photo-besar.jpg'
$bigBytes = New-Object byte[] (5 * 1024 * 1024 + 200000)
$bigBytes[0] = 0xFF; $bigBytes[1] = 0xD8; $bigBytes[2] = 0xFF
[IO.File]::WriteAllBytes($bigFile, $bigBytes)

# Barang uji dipilih sendiri, tidak memakai `$itemId`: database dev dipakai
# bersama, jadi begitu ada yang mengunggah foto lewat aplikasi barang pertama
# sudah punya foto - sedangkan bagian ini justru butuh barang yang masih kosong.
$photoItemId = ''
$photoDetail = $null
foreach ($candidate in [regex]::Matches($items.Body, 'href="/items/([A-Za-z0-9_-]{15,})"')) {
  $candidateId = $candidate.Groups[1].Value
  $candidateDetail = Hit "/items/$candidateId" $token
  if ($candidateDetail.Body.Contains('Belum ada foto')) {
    $photoItemId = $candidateId
    $photoDetail = $candidateDetail
    break
  }
}

if ($photoItemId) {
  HasText 'detail(foto)' $photoDetail.Body 'Foto barang'
  HasText 'detail(foto)' $photoDetail.Body 'Belum ada foto'
  HasText 'detail(foto)' $photoDetail.Body 'Unggah foto'
  # Tombol hapus hanya muncul kalau memang ada foto yang bisa dihapus.
  HasText 'detail(foto)' $photoDetail.Body 'Hapus foto' $false

  $upload = Submit-Action "/items/$photoItemId" 'Unggah foto' $photoItemId $token @{} `
    @{ photo = @{ Path = $photoFile; FileName = 'barang.jpg'; ContentType = 'image/jpeg' } }
  Check 'POST unggah foto status' $upload.Code 200
  HasText 'POST unggah foto' $upload.Body 'Foto barang berhasil diunggah.'

  # Nama berkas dibuat server (UUID + ekstensi dari isi berkas), jadi tidak ada
  # bagian dari nama kiriman klien yang ikut tersimpan.
  $photoMatch = [regex]::Match($upload.Body, '/api/photos/[0-9a-f-]{36}\.jpg')
  Check 'foto tampil di halaman detail' $photoMatch.Success $true
  $photoPath = $photoMatch.Value
  if (-not $photoMatch.Success) {
    Check 'nama berkas foto terdeteksi' $false $true
  }

  $detailAfterUpload = Hit "/items/$photoItemId" $token
  HasText 'detail(setelah unggah)' $detailAfterUpload.Body 'Ganti foto'
  HasText 'detail(setelah unggah)' $detailAfterUpload.Body 'Hapus foto'
  HasText 'detail(setelah unggah)' $detailAfterUpload.Body 'Belum ada foto' $false
  # Keterangan unggahan hanya muncul sebagai hasil aksi, bukan menempel terus.
  HasText 'detail(tanpa titipan) tidak mengklaim unggahan' $detailAfterUpload.Body 'berhasil diunggah' $false

  # Daftar barang & form edit ikut menampilkan fotonya.
  $itemsAfterUpload = Hit '/items' $token
  HasText 'items(setelah unggah)' $itemsAfterUpload.Body '/api/photos/'
  $editAfterUpload = Hit "/items/$photoItemId/edit" $token
  HasText 'edit(setelah unggah)' $editAfterUpload.Body 'Foto barang'
  HasText 'edit(setelah unggah)' $editAfterUpload.Body 'Hapus foto yang tersimpan'

  if ($photoMatch.Success) {
    # Berkas TIDAK di `public/`: tanpa sesi harus ditolak, dengan sesi utuh.
    $photoAnon = Get-Binary $photoPath ''
    Check 'GET foto tanpa sesi' $photoAnon.Code 401
    $photoAuthed = Get-Binary $photoPath $token
    Check 'GET foto dengan sesi' $photoAuthed.Code 200
    Check 'tipe konten foto' $photoAuthed.ContentType 'image/jpeg'
    Check 'panjang berkas foto sama' $photoAuthed.Bytes.Length $photoFixture.Length
    Check 'isi foto sama dengan yang diunggah' (($photoAuthed.Bytes[0] -eq 0xFF) -and ($photoAuthed.Bytes[1] -eq 0xD8)) $true
    # Nama berkas dibatasi pola UUID + ekstensi, jadi tidak bisa menembus folder.
    Check 'GET foto path traversal' (Get-Binary '/api/photos/..%2F..%2Fdev.db' $token).Code 404
    Check 'GET foto tidak ada' (Get-Binary '/api/photos/00000000-0000-0000-0000-000000000000.jpg' $token).Code 404
  }

  # Berkas yang bukan gambar ditolak, dan foto lama tidak ikut hilang.
  $notImage = Submit-Action "/items/$photoItemId" 'Ganti foto' $photoItemId $token @{} `
    @{ photo = @{ Path = $textFile; FileName = 'catatan.txt'; ContentType = 'text/plain' } }
  Check 'POST unggah non-gambar status' $notImage.Code 200
  HasText 'POST unggah non-gambar' $notImage.Body 'Berkas foto harus berupa gambar'
  HasText 'POST unggah non-gambar' $notImage.Body '/api/photos/'

  $tooBig = Submit-Action "/items/$photoItemId" 'Ganti foto' $photoItemId $token @{} `
    @{ photo = @{ Path = $bigFile; FileName = 'besar.jpg'; ContentType = 'image/jpeg' } }
  Check 'POST unggah terlalu besar status' $tooBig.Code 200
  HasText 'POST unggah terlalu besar' $tooBig.Body 'Ukuran foto maksimal 5 MB'

  # --- form edit barang ------------------------------------------------------
  # Form edit punya banyak field wajib. Nilainya dibaca dari HTML form itu
  # sendiri lalu dikirim ulang apa adanya, sehingga menyimpan ulang TIDAK boleh
  # menghapus data barang — jalur ini sebelumnya tidak diuji sama sekali.
  $formValues = Get-ItemFormValues (Hit "/items/$photoItemId/edit" $token).Body
  Check 'field form edit terbaca' ($formValues.Count -gt 15) $true

  $labels = @('Kategori', 'Unit pengelola', 'Merek', 'Model / tipe', 'Nomor seri', 'Jumlah', 'Harga satuan', 'Tanggal beli', 'Lokasi', 'Dipegang oleh', 'Catatan')
  $beforeEdit = @{}
  foreach ($label in $labels) { $beforeEdit[$label] = Get-DetailValue $detailAfterUpload.Body $label }

  # Simpan ulang sambil mengganti foto: berkas lama harus ikut dibuang.
  $editWithPhoto = Submit-Action "/items/$photoItemId/edit" 'Simpan Perubahan' $photoItemId $token $formValues `
    @{ photo = @{ Path = $photoFile; FileName = 'barang.jpg'; ContentType = 'image/jpeg' } }
  Check 'POST form edit + foto status' $editWithPhoto.Code 303
  # Pengalihan halaman tidak bisa membawa state, jadi keterangan "foto berhasil
  # diunggah" dititipkan di URL dan dibaca halaman detail.
  Check 'alih halaman edit menandai unggahan foto' ($editWithPhoto.Location -like '*photo=uploaded*') $true
  # Path disusun lewat penggabungan string: di dalam string PowerShell,
  # `$photoItemId?photo` dibaca sebagai nama variabel (`?` sah di nama variabel),
  # sehingga URL-nya rusak tanpa pesan error.
  # di dalam string yang dikutip.
  $noticePath = "/items/$photoItemId" + '?photo=uploaded'
  $detailWithNotice = Hit $noticePath $token
  HasText 'detail(setelah simpan form + foto)' $detailWithNotice.Body 'Foto barang berhasil diunggah.'

  $detailAfterEdit = Hit "/items/$photoItemId" $token
  $newPhoto = [regex]::Match($detailAfterEdit.Body, '/api/photos/[0-9a-f-]{36}\.jpg').Value
  Check 'foto diganti lewat form edit' (($newPhoto -ne '') -and ($newPhoto -ne $photoPath)) $true
  if ($photoPath -and $newPhoto) {
    Check 'berkas foto lama dibuang' (Get-Binary $photoPath $token).Code 404
  }
  foreach ($label in $labels) {
    Check "data '$label' tidak hilang saat simpan ulang" (Get-DetailValue $detailAfterEdit.Body $label) $beforeEdit[$label]
  }

  # Menyimpan ulang TANPA berkas harus mempertahankan foto yang sudah ada.
  $editKeepPhoto = Submit-Action "/items/$photoItemId/edit" 'Simpan Perubahan' $photoItemId $token (Get-ItemFormValues (Hit "/items/$photoItemId/edit" $token).Body)
  Check 'POST form edit tanpa berkas status' $editKeepPhoto.Code 303
  # Menyimpan tanpa berkas baru tidak boleh mengaku-ngaku ada unggahan.
  Check 'alih halaman tanpa berkas tidak menandai unggahan' ($editKeepPhoto.Location -like '*photo=uploaded*') $false
  $detailAfterKeep = Hit "/items/$photoItemId" $token
  HasText 'foto bertahan saat simpan ulang' $detailAfterKeep.Body $newPhoto
  Check 'riwayat pergerakan tidak bertambah' (Get-MovementCount $detailAfterKeep.Body) (Get-MovementCount $detailAfterUpload.Body)

  # Hapus foto: kolom dikosongkan sekaligus berkasnya dibuang dari disk.
  $removePhoto = Submit-Action "/items/$photoItemId" 'Hapus foto' $photoItemId $token
  Check 'POST hapus foto status' $removePhoto.Code 200
  HasText 'POST hapus foto' $removePhoto.Body 'Foto barang dihapus.'
  HasText 'detail(setelah hapus foto)' $removePhoto.Body 'Belum ada foto'
  HasText 'detail(setelah hapus foto)' $removePhoto.Body '/api/photos/' $false
  Check 'berkas foto dibuang dari disk' (Get-Binary $newPhoto $token).Code 404
} else {
  Check 'detail barang tanpa foto tersedia untuk uji foto' $false $true
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

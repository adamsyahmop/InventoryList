# Prosedur restore database

Backup dibuat oleh `node scripts/backup-db.mjs` (memakai `VACUUM INTO`), jadi
hasilnya **satu berkas SQLite utuh** — restore = menaruh berkas itu sebagai
database yang dipakai aplikasi, bukan menjalankan skrip SQL.

## Docker (VPS)

```bash
# 1. Hentikan aplikasi (migrate tidak perlu ikut naik)
docker compose stop app

# 2. Ganti isi volume dengan berkas backup
docker compose run --rm --entrypoint sh migrate -c \
  "cp /backup/inventory-2026-10-20T03-00-00.db /data/app.db && rm -f /data/app.db-wal /data/app.db-shm"

# 3. Nyalakan lagi
docker compose start app
```

Berkas backup harus terlihat di dalam container (mount folder backup host ke
`/backup`, mis. `-v /srv/backup:/backup:ro`).

## Tanpa Docker

```bash
# 1. Hentikan server (PM2/systemd) supaya tidak ada penulis aktif
# 2. Timpa database; buang -wal/-shm karena isinya milik database lama
cp backups/inventory-2026-10-20T03-00-00.db dev.db
rm -f dev.db-wal dev.db-shm

# 3. Jalankan migrasi (aman: kalau berkas backup sudah ter-migrate, tidak ada
#    perubahan) lalu start lagi
npx prisma migrate deploy
```

## Setelah restore

- Buka `/login`, cek beberapa barang dan halaman `/movements`.
- Cek `/opname`: sesi terakhir harus sama dengan sebelum backup.
- Foto barang ada di volume/folder `uploads/` — backup database **tidak**
  menyertakan berkas foto. Ikutkan folder itu dalam backup berkas
  (`tar czf uploads-$(date +%F).tgz uploads/`).

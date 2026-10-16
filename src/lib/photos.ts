import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PHOTO_MAX_BYTES,
  PHOTO_URL_PREFIX,
  describePhotoSize,
} from "./constants";

/**
 * Penyimpanan foto barang.
 *
 * Berkas ditulis ke `uploads/items/` — SENGAJA di luar `public/`, karena folder
 * itu disajikan sebagai aset statis tanpa pemeriksaan sesi. Pembacaan dilakukan
 * route handler `/api/photos/[name]` yang memeriksa login lebih dulu.
 *
 * Kolom `Item.photoUrl` menyimpan URL relatif (`/api/photos/<nama>`), bukan
 * path disk, supaya tetap sah walau aplikasi dipindah host atau folder.
 */
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "items");

/** Jenis gambar yang diterima → akhiran berkas yang dipakai di disk. */
const PHOTO_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
} as const;

type PhotoMime = keyof typeof PHOTO_TYPES;

const MIME_BY_EXT: Record<string, PhotoMime> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Nama berkas yang boleh dibaca kembali. Sekaligus penjaga path traversal:
 * `../`, path absolut, atau nama lain tidak akan pernah lolos pola ini.
 */
const PHOTO_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|gif)$/;

/**
 * Jenis gambar ditentukan dari beberapa byte pertama (magic bytes), bukan dari
 * `File.type` yang datang dari klien — klien bisa mengaku "image/png" untuk
 * berkas apa pun. Akhiran berkas pun diambil dari hasil ini, jadi isi disk
 * selalu cocok dengan `Content-Type` yang dikirim ulang nanti.
 */
function sniffImageType(bytes: Uint8Array): PhotoMime | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 ("\x89PNG")
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // GIF: "GIF8" (GIF87a / GIF89a)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // WEBP: "RIFF" … "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export type SavedPhoto = { url: string; path: string };

export type PhotoUpload =
  | { ok: true; file: SavedPhoto | null }
  | { ok: false; message: string };

/**
 * Baca berkas dari `formData` lalu simpan ke disk.
 *
 * Mengembalikan `file: null` bila form tidak menyertakan berkas — termasuk
 * form yang dikirim tanpa JavaScript dengan kolom berkas kosong. Dengan begitu
 * pemanggil bisa membedakan "foto tidak diganti" dari "foto dihapus", yang
 * keduanya sama-sama menghasilkan `photoUrl` kosong kalau tidak dibedakan.
 */
export async function savePhotoUpload(
  formData: FormData,
): Promise<PhotoUpload> {
  const value = formData.get("photo");
  if (!(value instanceof File) || value.size === 0) {
    return { ok: true, file: null };
  }

  if (value.size > PHOTO_MAX_BYTES) {
    return {
      ok: false,
      message: `Ukuran foto maksimal ${PHOTO_MAX_BYTES / 1024 / 1024} MB (berkas ini ${describePhotoSize(value.size)}).`,
    };
  }

  const bytes = new Uint8Array(await value.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) {
    return {
      ok: false,
      message: "Berkas foto harus berupa gambar JPG, PNG, WEBP, atau GIF.",
    };
  }

  // Nama berkas dibuat server: unik, tanpa karakter dari klien, dan akhiran
  // mengikuti isi berkas yang benar-benar terbaca.
  const name = `${randomUUID()}${PHOTO_TYPES[mime]}`;
  const target = path.join(UPLOAD_DIR, name);

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(target, bytes);
  } catch {
    return { ok: false, message: "Foto gagal disimpan. Coba lagi." };
  }

  return { ok: true, file: { url: `${PHOTO_URL_PREFIX}${name}`, path: target } };
}

/**
 * Buang berkas yang sudah ditulis tetapi gagal dipakai (mis. penyimpanan
 * database ditolak) supaya tidak menumpuk berkas yatim di `uploads/items`.
 */
export async function discardPhoto(file: SavedPhoto | null): Promise<void> {
  if (!file) return;
  await unlink(file.path).catch(() => undefined);
}

/**
 * Hapus berkas foto lama. Hanya berkas milik aplikasi ini yang disentuh: nilai
 * dari luar (mis. `https://…` sisa data lama) dibiarkan, sehingga tidak ada
 * jalan menghapus berkas sembarangan lewat kolom `photoUrl`.
 */
export async function deleteUploadedPhoto(
  url: string | null | undefined,
): Promise<void> {
  if (!url || !url.startsWith(PHOTO_URL_PREFIX)) return;

  const name = url.slice(PHOTO_URL_PREFIX.length);
  if (!PHOTO_NAME_PATTERN.test(name)) return;

  await unlink(path.join(UPLOAD_DIR, name)).catch(() => undefined);
}

/** Isi berkas untuk route handler `/api/photos/[name]`; `null` bila tak ada. */
export async function readUploadedPhoto(
  name: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null> {
  if (!PHOTO_NAME_PATTERN.test(name)) return null;

  const contentType = MIME_BY_EXT[path.extname(name)];
  if (!contentType) return null;

  const file = await readFile(path.join(UPLOAD_DIR, name)).catch(() => null);
  if (!file) return null;

  // Disalin ke ArrayBuffer biasa supaya bisa langsung dipakai `new Response()`
  // (tipe `Buffer` dari Node belum tentu diterima sebagai BodyInit).
  const bytes = new Uint8Array(file.byteLength);
  bytes.set(file);

  return { bytes, contentType };
}

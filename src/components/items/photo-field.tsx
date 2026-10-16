"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Field } from "@/components/ui/form-controls";
import { PHOTO_MAX_BYTES, describePhotoSize } from "@/lib/constants";

/** Sisi terpanjang setelah dikecilkan: cukup tajam untuk layar & label cetak. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Kecilkan foto di browser sebelum dikirim.
 *
 * Foto dari kamera HP biasanya 3–8 MB — jauh di atas batas unggah — dan
 * mengirimnya utuh juga lambat di jaringan seluler. Hasil pengecilan dipasang
 * kembali ke input berkas lewat `DataTransfer`, jadi form tetap terkirim
 * sebagai form biasa: tanpa JavaScript, berkas aslinya yang dikirim dan server
 * yang memutuskan (dan menolak dengan pesan yang jelas bila terlalu besar).
 */
async function shrinkPhoto(file: File): Promise<File> {
  // GIF bisa beranimasi dan tidak punya "ukuran gambar" tunggal: biarkan apa
  // adanya, batas ukuran di server yang menjaga.
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Sudah kecil dan tidak perlu dikecilkan: biarkan format aslinya (mis. PNG
    // transparan tetap PNG).
    if (scale === 1 && file.size <= PHOTO_MAX_BYTES / 2) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], "foto-barang.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/**
 * Kolom foto barang di form tambah/edit.
 *
 * Nilai tersimpan (`currentUrl`) tampil sebagai pratinjau, berkas baru
 * menggantikannya, dan centang "hapus foto" mengosongkannya — tiga keadaan itu
 * yang diterjemahkan server di `resolvePhotoField()`.
 */
export function PhotoField({
  currentUrl,
  error,
}: {
  currentUrl: string;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState(currentUrl);
  const [note, setNote] = useState("");
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);

  // URL objek pratinjau harus dilepas supaya memori browser tidak menumpuk
  // setiap kali pengguna memilih berkas lain.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  function showPreview(url: string) {
    if (objectUrlRef.current && objectUrlRef.current !== url) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = url.startsWith("blob:") ? url : null;
    setPreview(url);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      setNote("");
      showPreview(removed ? "" : currentUrl);
      return;
    }

    setBusy(true);
    try {
      const shrunk = await shrinkPhoto(file);
      if (shrunk !== file) {
        // Ganti isi input asli: yang terkirim ke server adalah versi kecilnya.
        const transfer = new DataTransfer();
        transfer.items.add(shrunk);
        input.files = transfer.files;
      }

      setRemoved(false);
      showPreview(URL.createObjectURL(shrunk));
      setNote(
        shrunk.size > PHOTO_MAX_BYTES
          ? `Ukuran ${describePhotoSize(shrunk.size)} masih di atas batas ${describePhotoSize(PHOTO_MAX_BYTES)}.`
          : `Siap diunggah: ${describePhotoSize(shrunk.size)}${
              shrunk === file ? "" : " (dikecilkan otomatis)"
            }.`,
      );
    } catch {
      // Browser lama atau format yang tidak bisa digambar (mis. HEIC): kirim apa
      // adanya — server menolaknya dengan pesan jelas bila bukan gambar yang
      // didukung.
      setRemoved(false);
      showPreview(URL.createObjectURL(file));
      setNote(`Siap diunggah: ${describePhotoSize(file.size)}.`);
    } finally {
      setBusy(false);
    }
  }

  function toggleRemoved(next: boolean) {
    setRemoved(next);
    if (next) {
      if (inputRef.current) inputRef.current.value = "";
      setNote("");
      showPreview("");
      return;
    }
    showPreview(currentUrl);
  }

  return (
    <Field
      label="Foto barang"
      htmlFor="photo"
      error={error}
      hint={`JPG, PNG, WEBP, atau GIF, maksimal ${describePhotoSize(PHOTO_MAX_BYTES)}. Foto dari HP dikecilkan otomatis sebelum dikirim.`}
      className="sm:col-span-2 lg:col-span-3"
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 text-center text-[0.65rem] text-neutral-500">
          {preview ? (
            // Berkas lokal dari route handler sendiri (butuh sesi), jadi tidak
            // bisa — dan tidak perlu — lewat pengoptimal `next/image`.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Pratinjau foto barang"
              className="h-full w-full object-cover"
            />
          ) : (
            "Belum ada foto"
          )}
        </div>

        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFile}
            className="block w-full cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700"
          />
          <p className="text-xs text-neutral-500">
            {busy
              ? "Menyiapkan foto…"
              : note || "Biarkan kosong bila tidak ingin mengganti foto."}
          </p>
          {currentUrl ? (
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                name="removePhoto"
                value="1"
                checked={removed}
                onChange={(event) => toggleRemoved(event.target.checked)}
                className="size-4 rounded border-neutral-300"
              />
              Hapus foto yang tersimpan
            </label>
          ) : null}
        </div>
      </div>
    </Field>
  );
}

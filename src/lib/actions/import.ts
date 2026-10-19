"use server";

import { updateTag } from "next/cache";
import { buildItemSearchKey, describeError, toItemWriteData } from "@/lib/action-utils";
import { requireAuth } from "@/lib/auth";
import { buildItemCode, itemCodeSequence, itemCodeYear } from "@/lib/constants";
import {
  buildMasterIndex,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  parseItemWorkbook,
  type ImportRowError,
} from "@/lib/item-import";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/queries";

/** Hasil yang ditampilkan halaman import; `errors` dibatasi 50 baris pertama. */
export type ImportState = {
  ok: boolean;
  message: string;
  created?: number;
  failed?: number;
  errors?: ImportRowError[];
};

const MAX_REPORTED_ERRORS = 50;

function invalidateCaches() {
  updateTag(CACHE_TAGS.items);
  updateTag(CACHE_TAGS.movements);
  updateTag(CACHE_TAGS.dashboard);
}

/**
 * Impor barang dari `.xlsx`.
 *
 * Baris diproses satu per satu di dalam transaksi masing-masing: baris yang
 * gagal tidak membatalkan baris lain, tetapi sebuah barang tidak akan pernah
 * tersimpan tanpa catatan pergerakan awalnya. Kode yang sudah dipakai (di
 * database maupun di baris sebelumnya pada berkas yang sama) ditolak, bukan
 * ditimpa — mengimpor ulang berkas yang sama akan melaporkan semua barisnya
 * sebagai duplikat alih-alih menggandakan data.
 */
export async function importItemsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAuth();

  const upload = formData.get("file");
  if (!(upload instanceof File) || upload.size === 0) {
    return { ok: false, message: "Pilih berkas .xlsx yang mau diimpor." };
  }
  if (!upload.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, message: "Berkas harus berformat .xlsx (bukan .xls atau .csv)." };
  }
  if (upload.size > IMPORT_MAX_BYTES) {
    return {
      ok: false,
      message: `Berkas terlalu besar (maksimal ${Math.round(IMPORT_MAX_BYTES / 1024 / 1024)} MB).`,
    };
  }

  const [categories, brands, departments, suppliers, locations, branches] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.brand.findMany({ select: { id: true, name: true } }),
    prisma.department.findMany({ select: { id: true, name: true, code: true } }),
    prisma.supplier.findMany({ select: { id: true, name: true } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
    prisma.branch.findMany({ select: { id: true, name: true } }),
  ]);

  const master = buildMasterIndex({
    categories,
    brands,
    departments,
    suppliers,
    locations,
    branches,
  });

  let parsed;
  try {
    parsed = await parseItemWorkbook(Buffer.from(await upload.arrayBuffer()), master);
  } catch (error) {
    return {
      ok: false,
      message: `Berkas tidak bisa dibaca sebagai .xlsx: ${describeError(error)}`,
    };
  }

  const errors: ImportRowError[] = [...parsed.errors];

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      message: errors.length
        ? "Tidak ada baris yang bisa diimpor. Perbaiki dulu baris yang dilaporkan di bawah."
        : "Berkas tidak memuat baris barang. Pastikan ada kolom \"Nama\" dan baris judul di atasnya.",
      failed: errors.length,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
    };
  }

  // Nomor urut berikutnya dihitung sekali, lalu dilanjutkan di memori supaya
  // berkas berisi banyak baris tanpa kode tidak saling menabrak.
  const year = new Date().getFullYear();
  const existing = await prisma.item.findMany({ select: { code: true } });
  const taken = new Set(existing.map((row) => row.code.toUpperCase()));
  let nextSequence = existing.reduce((max, row) => Math.max(max, itemCodeSequence(row.code)), 0);

  let created = 0;

  for (const row of parsed.rows) {
    let code = row.code;

    if (code && taken.has(code)) {
      errors.push({
        sheet: row.sheet,
        row: row.row,
        message: `Kode ${code} sudah dipakai barang lain — baris dilewati.`,
      });
      continue;
    }

    if (!code) {
      nextSequence += 1;
      code = buildItemCode(year, nextSequence, row.assetType);
    } else {
      // Kode manual tetap menaikkan nomor urut kalau tahunnya sama, supaya
      // barang berikutnya tidak memakai nomor yang sudah terpakai.
      if (itemCodeYear(code) === year) {
        nextSequence = Math.max(nextSequence, itemCodeSequence(code));
      }
    }

    try {
      const searchKey = await buildItemSearchKey(row.data);
      await prisma.$transaction(async (tx) => {
        const item = await tx.item.create({
          data: {
            ...toItemWriteData(row.data, searchKey, code),
            // Impor tidak membawa berkas foto; foto tetap ditambahkan lewat UI.
            photoUrl: null,
            createdBy: "admin",
          },
        });
        await tx.itemMovement.create({
          data: {
            itemId: item.id,
            toLocationId: item.locationId,
            toStatus: item.status,
            quantity: item.quantity,
            reason: "Pencatatan awal (impor)",
            movedBy: "admin",
          },
        });
      });
      taken.add(code);
      created += 1;
    } catch (error) {
      errors.push({ sheet: row.sheet, row: row.row, message: describeError(error) });
    }
  }

  if (created > 0) invalidateCaches();

  const parts = [`${created} barang diimpor`];
  if (errors.length > 0) parts.push(`${errors.length} baris dilewati`);
  if (parsed.truncated > 0) parts.push(`${parsed.truncated} baris melebihi batas ${IMPORT_MAX_ROWS}`);

  return {
    ok: created > 0,
    message: `${parts.join(", ")}.`,
    created,
    failed: errors.length,
    errors: errors.slice(0, MAX_REPORTED_ERRORS),
  };
}

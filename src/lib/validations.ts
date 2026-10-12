import { z } from "zod";
import {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";
import { ITEM_TYPE_VALUES } from "@/lib/constants";

/** FormData mengirim string kosong untuk field yang tidak diisi. */
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredString = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${label} wajib diisi`)
    .max(max, `${label} maksimal ${max} karakter`);

const optionalString = (max = 500) =>
  z.preprocess(
    emptyToUndefined,
    z.string().trim().max(max, `Maksimal ${max} karakter`).optional(),
  );

const optionalId = z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

const nonNegativeInt = (label: string) =>
  z.coerce
    .number({ error: `${label} harus berupa angka` })
    .int(`${label} harus bilangan bulat`)
    .min(0, `${label} tidak boleh negatif`);

/** Sama seperti `nonNegativeInt`, tetapi boleh dikosongkan. */
const optionalNonNegativeInt = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: `${label} harus berupa angka` })
      .int(`${label} harus bilangan bulat`)
      .min(0, `${label} tidak boleh negatif`)
      .optional(),
  );

/**
 * Select yang punya nilai default: string kosong diperlakukan sebagai
 * "tidak dipilih" sehingga jatuh ke `fallback` sebelum divalidasi.
 */
const enumOrDefault = <T extends z.ZodType>(schema: T, fallback: z.input<T>) =>
  z.preprocess((value) => emptyToUndefined(value) ?? fallback, schema);

export const itemSchema = z.object({
  // Kode boleh dikosongkan saat menambah barang: server membuat nomor urut
  // berikutnya lewat `generateItemCode()` (mis. INV-2026-0011-LPT). Saat
  // menyunting, kode kosong berarti "pertahankan kode yang sudah ada".
  code: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(60, "Kode barang maksimal 60 karakter")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
        "Kode hanya boleh huruf, angka, dan karakter . _ / -",
      )
      .optional(),
  ),
  // Jenis aset: jadi akhiran kode sekaligus informasi yang mudah difilter.
  assetType: z.preprocess(
    emptyToUndefined,
    z.enum(ITEM_TYPE_VALUES, { error: "Jenis barang tidak valid" }).optional(),
  ),
  name: requiredString("Nama barang", 200),
  brandId: optionalId,
  model: optionalString(150),
  categoryId: optionalId,
  quantity: nonNegativeInt("Jumlah").min(1, "Jumlah minimal 1"),
  unit: requiredString("Satuan", 30),
  purchaseDate: optionalDate,
  price: nonNegativeInt("Harga"),
  supplierId: optionalId,
  invoiceNo: optionalString(100),
  warrantyUntil: optionalDate,
  condition: z.enum(ItemCondition, {
    error: "Kondisi barang tidak valid",
  }),
  status: z.enum(ItemStatus, { error: "Status barang tidak valid" }),
  locationId: optionalId,
  assignedTo: optionalString(150),
  serialNumber: optionalString(150),
  photoUrl: optionalString(500),
  notes: optionalString(1000),

  // --- dimensi perolehan / kepemilikan -------------------------------------
  acquisitionSource: enumOrDefault(
    z.enum(AcquisitionSource, { error: "Sumber perolehan tidak valid" }),
    AcquisitionSource.HEAD_OFFICE,
  ),
  sourceBranchId: optionalId,
  ownerBranchId: optionalId,

  // --- metadata pelepasan aset ---------------------------------------------
  disposedAt: optionalDate,
  disposalReason: optionalString(200),
  soldAt: optionalDate,
  soldPrice: optionalNonNegativeInt("Harga jual"),
});

export type ItemInput = z.infer<typeof itemSchema>;

export const movementSchema = z.object({
  itemId: requiredString("Barang", 60),
  toLocationId: optionalId,
  toStatus: z.preprocess(
    emptyToUndefined,
    z.enum(ItemStatus, { error: "Status tidak valid" }).optional(),
  ),
  quantity: nonNegativeInt("Jumlah").min(1, "Jumlah minimal 1"),
  movedBy: optionalString(150),
  reason: optionalString(200),
  notes: optionalString(500),
});

export type MovementInput = z.infer<typeof movementSchema>;

const namedSchema = (label: string, max = 150) =>
  z.object({ name: requiredString(label, max) });

export const categorySchema = namedSchema("Nama kategori").extend({
  code: optionalString(20),
  description: optionalString(500),
});

export const brandSchema = namedSchema("Nama merek").extend({
  notes: optionalString(500),
});

export const branchSchema = namedSchema("Nama cabang").extend({
  code: requiredString("Kode cabang", 20).regex(
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
    "Kode hanya boleh huruf, angka, dan karakter . _ / -",
  ),
  notes: optionalString(500),
});

export const locationSchema = namedSchema("Nama lokasi").extend({
  building: optionalString(150),
  floor: optionalString(50),
  room: optionalString(150),
  branchId: optionalId,
  notes: optionalString(500),
});

export const supplierSchema = namedSchema("Nama supplier").extend({
  contact: optionalString(150),
  phone: optionalString(50),
  email: z.preprocess(
    emptyToUndefined,
    z.email("Format email tidak valid").max(200).optional(),
  ),
  address: optionalString(500),
  notes: optionalString(500),
});

export const loginSchema = z.object({
  password: z.string().min(1, "Password wajib diisi"),
});

/** Ubah ZodError menjadi map { namaField: pesanPertama }. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { describeError, type ActionState } from "@/lib/action-utils";
import { requireWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildItemWhere, CACHE_TAGS } from "@/lib/queries";

/**
 * Stock opname: hitung fisik, lalu terapkan selisihnya ke stok.
 *
 * Alurnya tiga langkah yang sengaja dipisah supaya bisa ditinggal di tengah:
 *
 * 1. `startOpnameAction` — kunci lingkup (semua / satu lokasi / satu cabang)
 *    dan **snapshot** stok sistem saat itu ke baris-baris opname. Snapshot itu
 *    penting: kalau stok berubah saat orang masih menghitung (ada barang keluar),
 *    pembandingnya tetap angka saat sesi dimulai, bukan angka yang bergerak.
 * 2. `saveOpnameCountsAction` — simpan hasil hitung per baris. Boleh dipanggil
 *    berkali-kali, boleh sebagian; yang belum diisi tetap `null`.
 * 3. `closeOpnameAction` — terapkan selisih: stok barang diubah dan satu baris
 *    riwayat pergerakan ditulis per barang yang selisih. Sesudah ditutup, sesi
 *    tidak bisa diubah lagi.
 */

const OPNAME_PREFIX = "OPN";

/** Kode sesi berikutnya: `OPN-2026-0001`. Nomor tidak dipakai ulang. */
async function nextOpnameCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${OPNAME_PREFIX}-${year}-`;

  const rows = await prisma.stockOpname.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });

  const next =
    rows.reduce((max, row) => {
      const value = Number(row.code.slice(prefix.length));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;

  return `${prefix}${String(next).padStart(4, "0")}`;
}

function invalidateOpnameCaches() {
  updateTag(CACHE_TAGS.opnames);
  updateTag(CACHE_TAGS.items);
  updateTag(CACHE_TAGS.movements);
  updateTag(CACHE_TAGS.dashboard);
}

/**
 * Mulai sesi opname baru untuk satu lingkup, lalu arahkan ke lembar hitungnya.
 *
 * Lingkup dipilih lewat cabang **atau** lokasi (tidak keduanya): lokasi sudah
 * punya cabang, jadi memilih dua-duanya hanya menimbulkan pertanyaan mana yang
 * menang. Barang yang sudah dihapus (soft delete) tidak ikut dihitung.
 */
export async function startOpnameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireWrite();

  const branchId = String(formData.get("branchId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (branchId && locationId) {
    return {
      ok: false,
      message: "Pilih salah satu lingkup: cabang atau lokasi, bukan keduanya.",
    };
  }

  let createdId = "";

  try {
    let scopeLabel = "Semua barang aktif";

    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) return { ok: false, message: "Cabang tidak ditemukan." };
      scopeLabel = `Cabang ${branch.name}`;
    }

    if (locationId) {
      const location = await prisma.location.findUnique({
        where: { id: locationId },
      });
      if (!location) return { ok: false, message: "Lokasi tidak ditemukan." };
      scopeLabel = `Lokasi ${location.name}`;
    }

    const items = await prisma.item.findMany({
      where: buildItemWhere({ branchId, locationId }),
      select: {
        id: true,
        code: true,
        name: true,
        quantity: true,
        location: { select: { name: true } },
      },
      orderBy: { code: "asc" },
    });

    if (items.length === 0) {
      return {
        ok: false,
        message: `Tidak ada barang aktif pada lingkup "${scopeLabel}", jadi tidak ada yang bisa dihitung.`,
      };
    }

    const opname = await prisma.stockOpname.create({
      data: {
        code: await nextOpnameCode(),
        scopeLabel,
        branchId: branchId || null,
        locationId: locationId || null,
        note: note || null,
        createdBy: actor.username,
        lines: {
          createMany: {
            data: items.map((item) => ({
              itemId: item.id,
              itemCode: item.code,
              itemName: item.name,
              locationName: item.location?.name ?? null,
              expectedQty: item.quantity,
            })),
          },
        },
      },
      select: { id: true },
    });

    createdId = opname.id;
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateOpnameCaches();
  redirect(`/opname/${createdId}`);
}

/** Jumlah fisik yang boleh dikirim: kosong (= belum dihitung) atau bulat ≥ 0. */
function parseCount(raw: string): number | null | "invalid" {
  const value = raw.trim();
  if (value === "") return null;
  if (!/^\d+$/.test(value)) return "invalid";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : "invalid";
}

/**
 * Simpan hasil hitung untuk baris-baris yang dikirim form.
 *
 * Hanya baris milik sesi ini yang disentuh, dan sesi yang sudah ditutup ditolak
 * — jejak opname yang sudah final tidak boleh bergeser diam-diam.
 */
export async function saveOpnameCountsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireWrite();

  const opnameId = String(formData.get("opnameId") ?? "").trim();
  if (!opnameId) return { ok: false, message: "Sesi opname tidak dikenal." };

  try {
    const opname = await prisma.stockOpname.findUnique({
      where: { id: opnameId },
      select: { id: true, status: true, lines: { select: { id: true, itemCode: true } } },
    });
    if (!opname) return { ok: false, message: "Sesi opname tidak ditemukan." };
    if (opname.status === "CLOSED") {
      return {
        ok: false,
        message: "Sesi ini sudah ditutup; hitungan tidak bisa diubah lagi.",
      };
    }

    const byId = new Map(opname.lines.map((line) => [line.id, line.itemCode]));
    const updates: {
      id: string;
      countedQty: number | null;
      note: string | null;
    }[] = [];

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("counted_") || typeof value !== "string") continue;

      const lineId = key.slice("counted_".length);
      const code = byId.get(lineId);
      // Baris asing (bukan milik sesi ini) diabaikan, bukan dipercaya.
      if (!code) continue;

      const counted = parseCount(value);
      if (counted === "invalid") {
        return {
          ok: false,
          message: `Jumlah fisik ${code} harus bilangan bulat 0 atau lebih.`,
        };
      }

      const noteRaw = formData.get(`note_${lineId}`);
      const note = typeof noteRaw === "string" ? noteRaw.trim() : "";

      updates.push({ id: lineId, countedQty: counted, note: note || null });
    }

    if (updates.length === 0) {
      return { ok: false, message: "Tidak ada baris yang dikirim." };
    }

    const countedAt = new Date();
    await prisma.$transaction(
      updates.map((update) =>
        prisma.stockOpnameLine.update({
          where: { id: update.id },
          data: {
            countedQty: update.countedQty,
            note: update.note,
            countedAt: update.countedQty === null ? null : countedAt,
          },
        }),
      ),
    );

    updateTag(CACHE_TAGS.opnames);

    const filled = updates.filter((update) => update.countedQty !== null).length;
    return {
      ok: true,
      message: `${filled} baris berisi hitungan, ${updates.length - filled} dikosongkan.`,
    };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

/**
 * Tutup sesi: terapkan selisih ke stok dan tulis riwayat pergerakan.
 *
 * Satu transaksi untuk semuanya — kalau satu penyesuaian gagal, tidak ada stok
 * yang setengah berubah. Baris yang belum dihitung dibiarkan apa adanya (tidak
 * dianggap nol); itu dilaporkan di pesan hasil.
 */
export async function closeOpnameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireWrite();

  const opnameId = String(formData.get("opnameId") ?? "").trim();
  if (!opnameId) return { ok: false, message: "Sesi opname tidak dikenal." };

  let adjusted = 0;
  let uncounted = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const opname = await tx.stockOpname.findUnique({
        where: { id: opnameId },
        include: { lines: true },
      });
      if (!opname) throw new Error("Sesi opname tidak ditemukan.");
      if (opname.status === "CLOSED") {
        throw new Error("Sesi ini sudah ditutup.");
      }

      const counted = opname.lines.filter((line) => line.countedQty !== null);
      uncounted = opname.lines.length - counted.length;

      if (counted.length === 0) {
        throw new Error(
          "Belum ada baris yang dihitung. Isi minimal satu jumlah fisik sebelum menutup sesi.",
        );
      }

      for (const line of counted) {
        const countedQty = line.countedQty as number;
        const diff = countedQty - line.expectedQty;
        if (diff === 0 || !line.itemId) continue;

        const item = await tx.item.findUnique({
          where: { id: line.itemId },
          select: { id: true, deletedAt: true, quantity: true },
        });
        // Barang yang sudah dihapus tetap tercatat di baris opname, tapi stoknya
        // tidak diubah lagi.
        if (!item || item.deletedAt) continue;

        await tx.item.update({
          where: { id: item.id },
          data: { quantity: countedQty },
        });

        await tx.itemMovement.create({
          data: {
            itemId: item.id,
            // Lokasi/status tidak berubah pada opname; yang berubah hanya jumlah.
            fromStatus: null,
            toStatus: null,
            quantity: diff,
            reason: `Stock opname ${opname.code}`,
            notes: `Stok sistem ${line.expectedQty} → fisik ${countedQty}`,
            movedBy: actor.username,
          },
        });

        adjusted += 1;
      }

      await tx.stockOpname.update({
        where: { id: opname.id },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    });
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }

  invalidateOpnameCaches();

  return {
    ok: true,
    message: `Sesi ditutup. ${adjusted} barang disesuaikan, ${uncounted} baris belum dihitung (tidak diubah).`,
  };
}

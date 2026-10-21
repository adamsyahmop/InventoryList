"use client";

import { useActionState } from "react";
import { closeOpnameAction, saveOpnameCountsAction } from "@/lib/actions/opname";
import type { ActionState } from "@/lib/action-utils";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { formatNumber } from "@/lib/format";

/** State awal form; sengaja lokal supaya modul aksi tidak ikut ke bundle klien. */
const EMPTY_ACTION_STATE: ActionState = { ok: false };

export type OpnameLineView = {
  id: string;
  itemCode: string;
  itemName: string;
  locationName: string | null;
  expectedQty: number;
  countedQty: number | null;
  note: string | null;
};

/**
 * Lembar hitung. Satu form untuk semua baris, disimpan sekaligus.
 *
 * Input jumlah sengaja dibiarkan kosong (bukan diisi 0) untuk baris yang belum
 * dihitung: "belum diperiksa" dan "diperiksa, hasilnya nol" adalah dua hal
 * berbeda, dan yang kedua justru temuan penting dalam opname.
 */
export function OpnameCountForm({
  opnameId,
  lines,
}: {
  opnameId: string;
  lines: OpnameLineView[];
}) {
  const [state, formAction, pending] = useActionState(
    saveOpnameCountsAction,
    EMPTY_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opnameId" value={opnameId} />

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Barang</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Lokasi</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Stok sistem
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">Jumlah fisik</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Catatan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-neutral-500">
                    {line.itemCode}
                  </span>
                  <p className="font-medium text-neutral-900">{line.itemName}</p>
                </td>
                <td className="px-4 py-2.5 text-neutral-600">
                  {line.locationName ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-600">
                  {formatNumber(line.expectedQty)}
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    name={`counted_${line.id}`}
                    defaultValue={line.countedQty ?? ""}
                    placeholder="belum"
                    aria-label={`Jumlah fisik ${line.itemCode}`}
                    className="w-24"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    name={`note_${line.id}`}
                    defaultValue={line.note ?? ""}
                    placeholder="mis. rusak, dipinjam"
                    aria-label={`Catatan ${line.itemCode}`}
                    className="w-56"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.message ? (
        <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan hitungan"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Tombol tutup sesi. Konfirmasi hanya berjalan di browser (progressive
 * enhancement tetap mengirim form walau JS mati), karena aksi ini mengubah stok
 * dan tidak bisa dibatalkan.
 */
export function OpnameCloseForm({
  opnameId,
  countedCount,
}: {
  opnameId: string;
  countedCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    closeOpnameAction,
    EMPTY_ACTION_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        const ok = window.confirm(
          "Tutup sesi ini? Stok barang akan disesuaikan dengan hasil hitung dan riwayat pergerakan ditulis. Setelah ditutup, hitungan tidak bisa diubah.",
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="opnameId" value={opnameId} />

      <p className="text-xs text-neutral-500">
        Menutup sesi menerapkan selisih ke stok sistem dan menulis satu baris
        riwayat pergerakan per barang yang selisih. Baris yang belum dihitung
        tidak diubah.
      </p>

      {state.message ? (
        <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}

      <div>
        <Button
          type="submit"
          variant="outline"
          disabled={pending || countedCount === 0}
        >
          {pending ? "Menutup…" : "Tutup opname"}
        </Button>
      </div>
    </form>
  );
}

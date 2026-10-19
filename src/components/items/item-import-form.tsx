"use client";

import { useActionState } from "react";
import { importItemsAction, type ImportState } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form-controls";

const INITIAL: ImportState = { ok: false, message: "" };

export function ItemImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importItemsAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Berkas .xlsx" htmlFor="file" required>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Mengimpor…" : "Impor barang"}
        </Button>
        {state.message ? (
          <p
            role="status"
            className={
              state.ok
                ? "text-sm font-medium text-emerald-700"
                : "text-sm font-medium text-red-700"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>

      {state.errors && state.errors.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">
            Baris yang dilewati ({state.failed ?? state.errors.length})
          </p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-amber-900/70">
                <tr>
                  <th className="py-1 pr-3">Sheet</th>
                  <th className="py-1 pr-3">Baris</th>
                  <th className="py-1">Pesan</th>
                </tr>
              </thead>
              <tbody>
                {state.errors.map((error, index) => (
                  <tr key={`${error.sheet}-${error.row}-${index}`} className="align-top">
                    <td className="py-1 pr-3 text-amber-900/80">{error.sheet}</td>
                    <td className="py-1 pr-3 text-amber-900/80">{error.row}</td>
                    <td className="py-1 text-amber-900">{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.failed && state.failed > state.errors.length ? (
            <p className="mt-2 text-xs text-amber-900/70">
              Menampilkan {state.errors.length} dari {state.failed} baris bermasalah.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

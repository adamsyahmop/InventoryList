"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import type { ActionState } from "@/lib/action-utils";
import { restoreItemAction } from "@/lib/actions/items";

const INITIAL_STATE: ActionState = { ok: false };

/**
 * Pulihkan barang dari Sampah. Berbeda dari `DeleteItemButton` yang mengarahkan
 * pengguna ke daftar aktif, tombol ini tetap di halaman Sampah dan cukup
 * menyegarkan daftarnya — jadi beberapa barang bisa dipulihkan berturut-turut.
 */
export function RestoreItemButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    restoreItemAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Pulihkan barang ini ke daftar aktif?")) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Memproses…" : "Pulihkan"}
      </Button>
      {state.message && !state.ok ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}
    </form>
  );
}

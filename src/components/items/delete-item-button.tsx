"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import type { ActionState } from "@/lib/action-utils";
import { deleteItemAction, restoreItemAction } from "@/lib/actions/items";

const INITIAL_STATE: ActionState = { ok: false };

/** Soft delete + pemulihan. Setelah berhasil, pengguna diarahkan ke daftar. */
export function DeleteItemButton({
  id,
  deleted = false,
}: {
  id: string;
  deleted?: boolean;
}) {
  const router = useRouter();
  const action = deleted ? restoreItemAction : deleteItemAction;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.ok) router.push("/items");
  }, [state.ok, router]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const message = deleted
          ? "Pulihkan barang ini ke daftar aktif?"
          : "Hapus barang ini? Data disembunyikan dari daftar, tetapi riwayatnya tetap tersimpan.";
        if (!window.confirm(message)) event.preventDefault();
      }}
      className="flex flex-col items-end gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={deleted ? "outline" : "danger"}
        disabled={isPending}
      >
        {isPending ? "Memproses…" : deleted ? "Pulihkan" : "Hapus"}
      </Button>
      {state.message && !state.ok ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}
    </form>
  );
}

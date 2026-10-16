"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import type { ActionState } from "@/lib/action-utils";
import {
  removeItemPhotoAction,
  uploadItemPhotoAction,
} from "@/lib/actions/items";

const INITIAL_STATE: ActionState = { ok: false };

const FILE_INPUT_CLASS =
  "block w-full cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700";

/**
 * Unggah / ganti / hapus foto langsung dari halaman detail.
 *
 * Dipisah dari form edit supaya foto bisa diurus tanpa membuka dan menyimpan
 * ulang seluruh data barang: aksinya hanya menyentuh kolom `photoUrl`. Dipakai
 * juga sebagai jalur uji smoke — dua form terpisah, masing-masing satu tombol.
 */
export function ItemPhotoControls({
  itemId,
  hasPhoto,
}: {
  itemId: string;
  hasPhoto: boolean;
}) {
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const [lastAction, setLastAction] = useState<"upload" | "remove">("upload");
  const [uploadState, uploadAction, uploading] = useActionState<
    ActionState,
    FormData
  >(uploadItemPhotoAction, INITIAL_STATE);
  const [removeState, removeAction, removing] = useActionState<
    ActionState,
    FormData
  >(removeItemPhotoAction, INITIAL_STATE);

  // Kosongkan kolom berkas setelah unggahan berhasil supaya tombol kirim tidak
  // terlihat seolah masih ada berkas yang menunggu.
  useEffect(() => {
    if (uploadState.ok) uploadFormRef.current?.reset();
  }, [uploadState.ok]);

  const state = lastAction === "upload" ? uploadState : removeState;

  return (
    <div className="flex flex-col gap-3">
      {state.message ? (
        <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}

      <form
        ref={uploadFormRef}
        action={uploadAction}
        onSubmit={() => setLastAction("upload")}
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="id" value={itemId} />
        <input
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          required
          aria-label="Berkas foto barang"
          className={FILE_INPUT_CLASS}
        />
        <Button type="submit" size="sm" disabled={uploading}>
          {uploading ? "Mengunggah…" : hasPhoto ? "Ganti foto" : "Unggah foto"}
        </Button>
      </form>

      {hasPhoto ? (
        <form
          action={removeAction}
          onSubmit={(event) => {
            setLastAction("remove");
            if (!window.confirm("Hapus foto barang ini?")) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={itemId} />
          <Button type="submit" variant="outline" size="sm" disabled={removing}>
            {removing ? "Menghapus…" : "Hapus foto"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

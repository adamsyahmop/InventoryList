"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { ItemStatus } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/action-utils";
import { createMovementAction } from "@/lib/actions/items";
import { ITEM_STATUS_LABELS } from "@/lib/constants";

const INITIAL_STATE: ActionState = { ok: false };

export function MovementForm({
  itemId,
  currentLocationId,
  currentStatus,
  locations,
}: {
  itemId: string;
  currentLocationId: string;
  currentStatus: ItemStatus;
  locations: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createMovementAction,
    INITIAL_STATE,
  );

  // Kosongkan form setelah pergerakan berhasil dicatat.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const errorOf = (field: string) => state.fieldErrors?.[field];

  return (
    <Card>
      <CardHeader
        title="Catat pergerakan"
        description="Pindahkan barang ke lokasi lain atau ubah statusnya."
      />
      <form ref={formRef} action={formAction}>
        <CardBody className="flex flex-col gap-4">
          {state.message ? (
            <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
          ) : null}

          <input type="hidden" name="itemId" value={itemId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lokasi tujuan" htmlFor="toLocationId" error={errorOf("toLocationId")}>
              <Select
                id="toLocationId"
                name="toLocationId"
                defaultValue={currentLocationId}
              >
                <option value="">— Belum ditempatkan —</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Status baru" htmlFor="toStatus" error={errorOf("toStatus")}>
              <Select id="toStatus" name="toStatus" defaultValue={currentStatus}>
                {Object.values(ItemStatus).map((status) => (
                  <option key={status} value={status}>
                    {ITEM_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Jumlah" htmlFor="movement-quantity" required error={errorOf("quantity")}>
              <Input
                id="movement-quantity"
                name="quantity"
                type="number"
                min={1}
                step={1}
                defaultValue="1"
                invalid={Boolean(errorOf("quantity"))}
                required
              />
            </Field>

            <Field label="Dipindahkan oleh" htmlFor="movedBy" error={errorOf("movedBy")}>
              <Input id="movedBy" name="movedBy" placeholder="Nama petugas" />
            </Field>

            <Field label="Alasan" htmlFor="reason" error={errorOf("reason")} className="sm:col-span-2">
              <Input
                id="reason"
                name="reason"
                placeholder="Contoh: dipinjam untuk rapat"
                invalid={Boolean(errorOf("reason"))}
              />
            </Field>

            <Field label="Catatan" htmlFor="movement-notes" error={errorOf("notes")} className="sm:col-span-2">
              <Textarea id="movement-notes" name="notes" rows={2} />
            </Field>
          </div>

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan…" : "Catat Pergerakan"}
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}

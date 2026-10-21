"use client";

import { useActionState } from "react";
import { startOpnameAction } from "@/lib/actions/opname";
import type { ActionState } from "@/lib/action-utils";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form-controls";

/** State awal form; sengaja lokal supaya modul aksi tidak ikut ke bundle klien. */
const EMPTY_ACTION_STATE: ActionState = { ok: false };

export type OpnameScopeOption = {
  id: string;
  name: string;
  branchName?: string | null;
};

/**
 * Form mulai sesi opname. Lingkup dipilih lewat salah satu dropdown saja —
 * memilih cabang sekaligus lokasi ditolak di server, karena lokasi sudah
 * berada di dalam cabang.
 */
export function OpnameStartForm({
  branches,
  locations,
}: {
  branches: OpnameScopeOption[];
  locations: OpnameScopeOption[];
}) {
  const [state, formAction, pending] = useActionState(
    startOpnameAction,
    EMPTY_ACTION_STATE,
  );

  return (
    <Card>
      <CardHeader
        title="Mulai sesi baru"
        description="Stok sistem dikunci saat sesi dimulai, lalu dibandingkan dengan hasil hitung fisik."
      />
      <CardBody>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opname-branch">Cabang (opsional)</Label>
              <Select id="opname-branch" name="branchId" defaultValue="">
                <option value="">— Tidak dibatasi cabang —</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opname-location">Lokasi (opsional)</Label>
              <Select id="opname-location" name="locationId" defaultValue="">
                <option value="">— Tidak dibatasi lokasi —</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.branchName
                      ? `${location.name} · ${location.branchName}`
                      : location.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opname-note">Catatan (opsional)</Label>
            <Input
              id="opname-note"
              name="note"
              placeholder="mis. Opname bulanan gudang A"
            />
          </div>

          <p className="text-xs text-neutral-500">
            Kosongkan keduanya untuk menghitung seluruh barang aktif. Isi salah
            satu untuk mempersempit lingkup.
          </p>

          {state.message ? (
            <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
          ) : null}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyiapkan…" : "Mulai opname"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

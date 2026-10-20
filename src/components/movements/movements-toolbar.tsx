"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form-controls";
import { ITEM_STATUS_LABELS } from "@/lib/constants";
import { ItemStatus } from "@/generated/prisma/enums";

export type MovementFilterValues = {
  q: string;
  reason: string;
  status: string;
  from: string;
  to: string;
};

function buildHref(values: MovementFilterValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/movements?${query}` : "/movements";
}

export function MovementsToolbar({
  initial,
  total,
}: {
  initial: MovementFilterValues;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<MovementFilterValues>(initial);
  const isFirstRender = useRef(true);

  const update = (patch: Partial<MovementFilterValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    startTransition(() => router.replace(buildHref(next)));
  };

  // Kolom teks tidak boleh menavigasi tiap ketikan.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      startTransition(() => router.replace(buildHref(values)));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.q, values.reason]);

  const hasFilter = Boolean(
    values.q || values.reason || values.status || values.from || values.to,
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-52 flex-1 flex-col gap-1.5">
          <Label htmlFor="movement-q">Cari barang</Label>
          <Input
            id="movement-q"
            value={values.q}
            placeholder="Nama atau kode barang"
            onChange={(event) => update({ q: event.target.value })}
          />
        </div>

        <div className="flex min-w-52 flex-1 flex-col gap-1.5">
          <Label htmlFor="movement-reason">Alasan / keterangan</Label>
          <Input
            id="movement-reason"
            value={values.reason}
            placeholder="mis. Perbaikan, Sampah"
            onChange={(event) => update({ reason: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movement-status">Status akhir</Label>
          <Select
            id="movement-status"
            value={values.status}
            onChange={(event) => update({ status: event.target.value })}
            className="w-40"
          >
            <option value="">Semua</option>
            {Object.values(ItemStatus).map((status) => (
              <option key={status} value={status}>
                {ITEM_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movement-from">Dari tanggal</Label>
          <Input
            id="movement-from"
            type="date"
            value={values.from}
            onChange={(event) => update({ from: event.target.value })}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movement-to">Sampai tanggal</Label>
          <Input
            id="movement-to"
            type="date"
            value={values.to}
            onChange={(event) => update({ to: event.target.value })}
            className="w-40"
          />
        </div>

        {hasFilter ? (
          <Button
            variant="ghost"
            onClick={() =>
              update({ q: "", reason: "", status: "", from: "", to: "" })
            }
          >
            Reset
          </Button>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {pending ? "Memuat…" : `${total} catatan ditemukan`}
      </p>
    </div>
  );
}

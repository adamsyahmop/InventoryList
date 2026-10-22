"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import type { ActionState } from "@/lib/action-utils";

const INITIAL_STATE: ActionState = { ok: false };

export type MasterOption = { value: string; label: string };

export type MasterFieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "textarea" | "select";
  placeholder?: string;
  required?: boolean;
  /** Hanya dipakai bila `type` = "select". */
  options?: MasterOption[];
};

export type MasterRow = {
  id: string;
  label: string;
  meta?: string;
  values: Record<string, string>;
};

export type MasterAction = (
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

/**
 * Satu baris master: label, tombol Edit, dan tombol Hapus.
 *
 * State aksi hapus diletakkan di sini (bukan di `MasterManager`) supaya tiap
 * baris punya state sendiri, sekaligus pesannya bisa ditampilkan selebar baris.
 * Pesan penolakan harus terlihat: `delete*Action` menolak menghapus data master
 * yang masih dipakai, dan tanpa teks yang terbaca penolakan itu tampak seperti
 * tombol yang tidak bekerja.
 */
function MasterRowItem({
  row,
  deleteAction,
  onEdit,
  canManage,
}: {
  row: MasterRow;
  deleteAction: MasterAction;
  onEdit: (row: MasterRow) => void;
  canManage: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    deleteAction,
    INITIAL_STATE,
  );

  return (
    <li className="py-2" data-row-id={row.id}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-800">
            {row.label}
          </p>
          {row.meta ? (
            <p className="truncate text-xs text-neutral-400">{row.meta}</p>
          ) : null}
        </div>
        {/*
          Tombol tetap ada di markup (hanya `hidden`) supaya struktur baris tidak
          berubah antar peran: kalau dihapus lewat ternary, React memecah baris
          jadi boundary terpisah dan HTML-nya tidak lagi berurutan.
        */}
        <div
          className="flex shrink-0 items-center gap-1"
          data-actions={canManage ? "shown" : "hidden"}
          hidden={!canManage}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(row)}
          >
            Edit
          </Button>
          <form
            action={formAction}
            onSubmit={(event) => {
              if (!window.confirm(`Hapus "${row.label}"?`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={row.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={isPending}
              className="text-red-600 hover:bg-red-50"
            >
              {isPending ? "…" : "Hapus"}
            </Button>
          </form>
        </div>
      </div>
      {state.message && !state.ok ? (
        <div className="mt-2">
          <Alert tone="error">
            <span className="text-xs">{state.message}</span>
          </Alert>
        </div>
      ) : null}
    </li>
  );
}

export function MasterManager({
  title,
  description,
  fields,
  rows,
  saveAction,
  deleteAction,
  emptyText,
  canManage = true,
}: {
  title: string;
  description?: string;
  fields: MasterFieldDef[];
  rows: MasterRow[];
  saveAction: MasterAction;
  deleteAction: MasterAction;
  emptyText: string;
  /** Non-admin melihat daftar saja; form tambah/edit/hapus disembunyikan. */
  canManage?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveAction,
    INITIAL_STATE,
  );
  const [editing, setEditing] = useState<MasterRow | null>(null);

  // Setelah simpan berhasil, form dikembalikan ke mode "tambah". Penyesuaian
  // state dilakukan saat render, bukan di dalam effect, mengikuti pola resmi
  // React "adjusting state when props change":
  // https://react.dev/learn/you-might-not-need-an-effect
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok) setEditing(null);
  }

  const errorOf = (field: string) => state.fieldErrors?.[field];

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="flex flex-col gap-4">
        {state.message ? (
          <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
        ) : null}

        {canManage ? (
        <form
          key={editing?.id ?? "new"}
          action={formAction}
          className="grid gap-3 rounded-lg bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          {fields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={`${title}-${field.name}`}
              error={errorOf(field.name)}
              required={field.required}
              className={field.type === "textarea" ? "sm:col-span-2 lg:col-span-3" : undefined}
            >
              {field.type === "textarea" ? (
                <Textarea
                  id={`${title}-${field.name}`}
                  name={field.name}
                  rows={2}
                  defaultValue={editing?.values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  invalid={Boolean(errorOf(field.name))}
                />
              ) : field.type === "select" ? (
                <Select
                  id={`${title}-${field.name}`}
                  name={field.name}
                  defaultValue={editing?.values[field.name] ?? ""}
                  invalid={Boolean(errorOf(field.name))}
                  required={field.required}
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={`${title}-${field.name}`}
                  name={field.name}
                  type={field.type ?? "text"}
                  defaultValue={editing?.values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  invalid={Boolean(errorOf(field.name))}
                  required={field.required}
                />
              )}
            </Field>
          ))}

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Tambah"}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(null)}
              >
                Batal
              </Button>
            ) : null}
          </div>
        </form>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
            {rows.map((row) => (
              <MasterRowItem
                key={row.id}
                row={row}
                deleteAction={deleteAction}
                onEdit={setEditing}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

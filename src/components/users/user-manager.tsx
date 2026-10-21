"use client";

import { useActionState } from "react";
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "@/lib/actions/users";
import type { ActionState } from "@/lib/action-utils";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Label, Select } from "@/components/ui/form-controls";
import { formatDateTime } from "@/lib/format";

/** State awal lokal: modul aksi tidak boleh ikut ke bundle klien. */
const EMPTY_ACTION_STATE: ActionState = { ok: false };

export type UserRowView = {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "STAFF" | "VIEWER";
  active: boolean;
  lastLoginAt: Date | string | null;
};

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin — semua akses" },
  { value: "STAFF", label: "Staff — pekerjaan inventaris" },
  { value: "VIEWER", label: "Viewer — hanya melihat" },
] as const;

const ROLE_BADGE: Record<UserRowView["role"], string> = {
  ADMIN: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  STAFF: "bg-sky-50 text-sky-700 ring-sky-600/20",
  VIEWER: "bg-neutral-100 text-neutral-600 ring-neutral-500/20",
};

export function UserCreateForm() {
  const [state, formAction, pending] = useActionState(
    createUserAction,
    EMPTY_ACTION_STATE,
  );

  return (
    <Card>
      <CardHeader
        title="Tambah akun"
        description="Password disimpan sebagai hash scrypt; admin tidak bisa melihat password lama, hanya menggantinya."
      />
      <CardBody>
        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Username"
            htmlFor="new-username"
            error={state.fieldErrors?.username}
            required
          >
            <Input
              id="new-username"
              name="username"
              placeholder="mis. adam"
              autoComplete="off"
              invalid={Boolean(state.fieldErrors?.username)}
            />
          </Field>

          <Field
            label="Nama lengkap"
            htmlFor="new-name"
            error={state.fieldErrors?.name}
            required
          >
            <Input id="new-name" name="name" placeholder="mis. Adam Saputra" />
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role">Peran</Label>
            <Select id="new-role" name="role" defaultValue="STAFF">
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <Field
            label="Password awal"
            htmlFor="new-password"
            error={state.fieldErrors?.password}
            required
          >
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="minimal 8 karakter"
            />
          </Field>

          <div className="sm:col-span-2">
            {state.message ? (
              <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Tambah akun"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function UserRow({ user, isSelf }: { user: UserRowView; isSelf: boolean }) {
  const [updateState, updateAction, updating] = useActionState(
    updateUserAction,
    EMPTY_ACTION_STATE,
  );
  const [resetState, resetAction, resetting] = useActionState(
    resetUserPasswordAction,
    EMPTY_ACTION_STATE,
  );

  return (
    <tr className="align-top hover:bg-neutral-50">
      <td className="px-4 py-3">
        <p className="font-medium text-neutral-900">
          {user.name}
          {isSelf ? (
            <span className="ml-2 text-xs font-normal text-neutral-400">(Anda)</span>
          ) : null}
        </p>
        <p className="font-mono text-xs text-neutral-500">{user.username}</p>
        <p className="mt-1 text-xs text-neutral-400">
          {user.lastLoginAt
            ? `login terakhir ${formatDateTime(user.lastLoginAt)}`
            : "belum pernah login"}
        </p>
      </td>

      <td className="px-4 py-3">
        <form action={updateAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={user.id} />
          <Input
            name="name"
            defaultValue={user.name}
            aria-label={`Nama ${user.username}`}
            className="w-44"
          />
          <Select
            name="role"
            defaultValue={user.role}
            aria-label={`Peran ${user.username}`}
            className="w-44"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              name="active"
              defaultChecked={user.active}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Aktif
          </label>
          <Button type="submit" variant="outline" size="sm" disabled={updating}>
            {updating ? "Menyimpan…" : "Simpan"}
          </Button>
          {updateState.message ? (
            <Alert tone={updateState.ok ? "success" : "error"}>
              {updateState.message}
            </Alert>
          ) : null}
        </form>
      </td>

      <td className="px-4 py-3">
        <form action={resetAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={user.id} />
          <Input
            name="password"
            type="password"
            placeholder="password baru"
            autoComplete="new-password"
            aria-label={`Password baru ${user.username}`}
            className="w-44"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={resetting}>
            {resetting ? "Mengganti…" : "Ganti password"}
          </Button>
          {resetState.message ? (
            <Alert tone={resetState.ok ? "success" : "error"}>
              {resetState.message}
            </Alert>
          ) : null}
        </form>
      </td>

      <td className="px-4 py-3">
        <Badge className={ROLE_BADGE[user.role]}>{user.role}</Badge>
        <p className="mt-1 text-xs">
          {user.active ? (
            <span className="text-emerald-700">aktif</span>
          ) : (
            <span className="text-red-700">nonaktif</span>
          )}
        </p>
      </td>
    </tr>
  );
}

export function UserTable({
  users,
  actorId,
}: {
  users: UserRowView[];
  actorId: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Daftar akun"
        description="Akun nonaktif langsung kehilangan akses walau masih memegang cookie sesi."
      />
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Akun</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Nama & peran</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Password</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((user) => (
                <UserRow key={user.id} user={user} isSelf={user.id === actorId} />
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

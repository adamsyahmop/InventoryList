import { Suspense } from "react";
import type { Metadata } from "next";
import {
  UserCreateForm,
  UserTable,
} from "@/components/users/user-manager";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { getSession, ROLE_LABELS } from "@/lib/auth";
import { listUsers } from "@/lib/queries";

export const metadata: Metadata = { title: "Pengguna" };

function UsersSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="h-64 animate-pulse bg-neutral-100" />
      <Card className="h-64 animate-pulse bg-neutral-100" />
    </div>
  );
}

async function UsersSection() {
  const actor = await getSession();
  // Halaman ini khusus admin. Guard sebenarnya ada di setiap action
  // (`requireAdmin`), ini hanya supaya pengguna lain tidak melihat form yang
  // pasti ditolak.
  if (!actor || actor.role !== "ADMIN") {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-neutral-600">
            Halaman ini hanya untuk admin. Akun Anda masuk sebagai{" "}
            {actor ? ROLE_LABELS[actor.role] : "tamu"}.
          </p>
        </CardBody>
      </Card>
    );
  }

  const users = await listUsers();

  return (
    <div className="flex flex-col gap-4">
      <UserCreateForm />
      <UserTable users={users} actorId={actor.id} />
    </div>
  );
}

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengguna"
        description="Akun per orang: jejak audit memakai username yang login, bukan nama kolom yang bisa diketik bebas."
        action={
          <ButtonLink href="/" variant="outline">
            Kembali ke dashboard
          </ButtonLink>
        }
      />
      <Suspense fallback={<UsersSkeleton />}>
        <UsersSection />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Masuk" };

function LoginCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
            IN
          </span>
          <h1 className="mt-3 text-lg font-semibold text-neutral-900">
            Inventaris Barang
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Masukkan password untuk melanjutkan.
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

async function LoginSection({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  return <LoginForm next={next} />;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <LoginCard>
      <Suspense fallback={<div className="h-40" />}>
        <LoginSection searchParams={searchParams} />
      </Suspense>
    </LoginCard>
  );
}

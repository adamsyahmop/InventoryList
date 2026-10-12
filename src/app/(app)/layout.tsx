import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";

/** Rangka navigasi statis, dipakai sebagai fallback saat nav di-stream. */
function NavFallback() {
  return (
    <div className="h-14 border-b border-neutral-200 bg-white" aria-hidden="true" />
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <Suspense fallback={<NavFallback />}>
        <AppNav />
      </Suspense>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-400">
        Inventaris Barang · Next.js 16 + Prisma 7 + SQLite
      </footer>
    </div>
  );
}

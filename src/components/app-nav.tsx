"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export type NavUser = {
  name: string;
  username: string;
  role: "ADMIN" | "STAFF" | "VIEWER";
};

const ROLE_LABELS = { ADMIN: "Admin", STAFF: "Staff", VIEWER: "Viewer" } as const;

/**
 * Menu dengan peran minimum. Menyembunyikan menu BUKAN pengamanan — setiap
 * action memakai `requireAdmin`/`requireWrite`; ini hanya supaya pengguna tidak
 * menekan tombol yang pasti ditolak.
 */
const NAV_ITEMS: { href: string; label: string; role?: NavUser["role"] }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/items", label: "Barang" },
  { href: "/items/terhapus", label: "Sampah" },
  { href: "/movements", label: "Pergerakan" },
  { href: "/opname", label: "Stock Opname" },
  { href: "/laporan/nilai-buku", label: "Nilai Buku" },
  { href: "/master", label: "Data Master" },
  { href: "/pengguna", label: "Pengguna", role: "ADMIN" },
];

function matches(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Ambil href terpanjang yang cocok. Tanpa ini, `/items/terhapus` ikut menyalakan
 * menu `/items` karena keduanya berbagi prefix.
 */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    if (matches(pathname, item.href) && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

export function AppNav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const current = activeHref(pathname);
  const items = NAV_ITEMS.filter(
    (item) => !item.role || (user !== null && user.role === item.role),
  );

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
            IN
          </span>
          <span className="text-sm font-semibold tracking-tight text-neutral-900">
            Inventaris
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current === item.href ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                current === item.href
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/api/export"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:block"
          >
            Export Excel
          </a>
          {user ? (
            <span
              className="hidden text-xs leading-tight text-neutral-500 sm:block"
              title={`@${user.username}`}
            >
              <span className="block font-medium text-neutral-800">{user.name}</span>
              {ROLE_LABELS[user.role]}
            </span>
          ) : null}
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

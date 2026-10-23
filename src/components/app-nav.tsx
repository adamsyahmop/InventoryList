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

type NavIconName =
  | "dashboard"
  | "box"
  | "swap"
  | "clipboard"
  | "chart"
  | "database"
  | "users"
  | "trash";

/** Ikon garis 16px. Inline supaya tidak menambah dependensi ikon. */
const NAV_ICONS: Record<NavIconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1.2" />
      <rect x="9.5" y="2.5" width="5" height="5" rx="1.2" />
      <rect x="2.5" y="9.5" width="5" height="5" rx="1.2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" />
    </>
  ),
  box: (
    <>
      <path d="M2.5 5.5 8.5 2.5l6 3v6l-6 3-6-3z" />
      <path d="M2.5 5.5 8.5 8.5l6-3M8.5 8.5v6.5" />
    </>
  ),
  swap: <path d="M3 6h8l-2.5-2.5M14 10H6l2.5 2.5" />,
  clipboard: (
    <>
      <rect x="4" y="3" width="8.5" height="11" rx="1.5" />
      <path d="M6.5 3V2h3.5v1" />
      <path d="M6 7.5l1.5 1.5L10 6.5" />
    </>
  ),
  chart: (
    <>
      <path d="M2.5 13.5h11" />
      <path d="M4.5 11V8M7.5 11V4.5M10.5 11V6.5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="8.5" cy="4" rx="5.5" ry="2" />
      <path d="M3 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" />
      <path d="M3 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
    </>
  ),
  users: (
    <>
      <circle cx="6.5" cy="6" r="2.5" />
      <path d="M2.5 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5" />
      <path d="M11 4.2a2.5 2.5 0 0 1 0 4.6M12.5 13.5c0-1.4-.5-2.4-1.3-3.1" />
    </>
  ),
  trash: (
    <>
      <path d="M3 5h11" />
      <path d="M5.5 5V3.5h5V5" />
      <path d="M4.5 5l.7 8.2c.06.8.7 1.3 1.5 1.3h3.6c.8 0 1.44-.5 1.5-1.3L12.5 5" />
      <path d="M7 8v4M9.5 8v4" />
    </>
  ),
};

/**
 * Menu dengan peran minimum. Menyembunyikan menu BUKAN pengamanan — setiap
 * action memakai `requireAdmin`/`requireWrite`; ini hanya supaya pengguna tidak
 * menekan tombol yang pasti ditolak.
 *
 * Urutan disengaja: alur kerja harian dulu (dashboard → barang → pergerakan →
 * opname → laporan → master), lalu pengguna (admin), dan **Sampah paling
 * akhir** — halaman itu pemulihan/insidental, bukan pekerjaan sehari-hari.
 */
const NAV_ITEMS: {
  href: string;
  label: string;
  icon: NavIconName;
  role?: NavUser["role"];
  /** Dipisahkan garis tipis dari kelompok utama (area sekunder). */
  utility?: boolean;
}[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/items", label: "Barang", icon: "box" },
  { href: "/movements", label: "Pergerakan", icon: "swap" },
  { href: "/opname", label: "Opname", icon: "clipboard" },
  { href: "/laporan/nilai-buku", label: "Nilai Buku", icon: "chart" },
  { href: "/master", label: "Master", icon: "database" },
  { href: "/pengguna", label: "Pengguna", icon: "users", role: "ADMIN" },
  { href: "/items/terhapus", label: "Sampah", icon: "trash", utility: true },
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function Icon({ name }: { name: NavIconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {NAV_ICONS[name]}
    </svg>
  );
}

export function AppNav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const current = activeHref(pathname);
  const items = NAV_ITEMS.filter(
    (item) => !item.role || (user !== null && user.role === item.role),
  );

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:gap-5 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          aria-label="Inventaris — dashboard"
        >
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-bold text-white shadow-sm shadow-indigo-600/20">
            IN
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-neutral-900 sm:block">
            Inventaris
          </span>
        </Link>

        <nav
          aria-label="Menu utama"
          className="flex flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => {
            const isActive = current === item.href;
            return (
              <div key={item.href} className="flex items-center">
                {item.utility ? (
                  <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-neutral-200" />
                ) : null}
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                      : item.utility
                        ? "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                  )}
                >
                  <Icon name={item.icon} />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href="/api/export"
            title="Ekspor daftar barang ke Excel"
            className="hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 lg:flex"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 2.5v7M5.5 7 8 9.5 10.5 7" />
              <path d="M3 11.5v1.2c0 .7.6 1.3 1.3 1.3h7.4c.7 0 1.3-.6 1.3-1.3v-1.2" />
            </svg>
            Ekspor
          </a>

          {user ? (
            <span
              className="flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5"
              title={`@${user.username}`}
            >
              <span className="grid size-7 place-items-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-700">
                {initials(user.name)}
              </span>
              <span className="hidden text-xs leading-tight text-neutral-500 sm:block">
                <span className="block max-w-28 truncate font-medium text-neutral-800">
                  {user.name}
                </span>
                {ROLE_LABELS[user.role]}
              </span>
            </span>
          ) : null}

          <form action={logoutAction}>
            <button
              type="submit"
              title="Keluar"
              aria-label="Keluar"
              className="grid size-8 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 13.5H3.8c-.7 0-1.3-.6-1.3-1.3V3.8c0-.7.6-1.3 1.3-1.3H6" />
                <path d="M10 5.5 12.5 8 10 10.5M12.5 8H6" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

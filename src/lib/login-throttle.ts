/**
 * Pembatasan percobaan login (Tier A #4).
 *
 * Satu password dipakai bersama seluruh pengguna, jadi tanpa pembatas siapa pun
 * bisa menebak password lewat POST /login berulang kali. Aturannya:
 *
 * - kunci per **IP klien** (bukan per akun, karena tidak ada akun);
 * - jendela hitung 15 menit, maksimal 5 kegagalan;
 * - kegagalan ke-5 mengunci IP itu selama 15 menit — password yang benar pun
 *   ditolak selama kunci aktif, supaya tebakan tidak bisa "menyelip";
 * - login berhasil menghapus catatan IP tersebut.
 *
 * Penyimpanan sengaja **in-memory** (per proses), bukan tabel database: tidak
 * ada tulis-baca DB di jalur login, tidak perlu migrasi, dan tidak ada data
 * pribadi yang tersimpan di disk. Konsekuensinya status kunci hilang saat
 * proses restart — dapat diterima untuk aplikasi satu-instance; kalau nanti
 * jalan di beberapa instance, pindahkan `store` ke tabel/Redis.
 */

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** Batas jumlah IP yang dilacak supaya memori tidak tumbuh tanpa batas. */
const MAX_TRACKED_KEYS = 1000;

type Entry = {
  failures: number;
  windowStart: number;
  lockedUntil: number;
};

export type ThrottleState = {
  /** true = permintaan harus ditolak walau password benar. */
  blocked: boolean;
  /** Sisa detik sampai kunci dibuka (0 bila tidak terkunci). */
  retryAfterSeconds: number;
  /** Sisa percobaan sebelum IP ini dikunci. */
  remaining: number;
};

const globalForThrottle = globalThis as unknown as {
  __loginThrottle?: Map<string, Entry>;
};

/** Disimpan di globalThis supaya tidak dobel saat modul di-reload (dev/HMR). */
const store: Map<string, Entry> = (globalForThrottle.__loginThrottle ??= new Map());

function toState(entry: Entry, at: number): ThrottleState {
  const locked = entry.lockedUntil > at;
  return {
    blocked: locked,
    retryAfterSeconds: locked ? Math.ceil((entry.lockedUntil - at) / 1000) : 0,
    remaining: locked ? 0 : Math.max(0, MAX_LOGIN_FAILURES - entry.failures),
  };
}

/** Buang entri yang sudah kedaluwarsa bila peta sudah terlalu besar. */
function prune(at: number): void {
  if (store.size <= MAX_TRACKED_KEYS) return;

  for (const [key, entry] of store) {
    const idle = at - entry.windowStart > LOGIN_WINDOW_MS;
    if (idle && entry.lockedUntil <= at) store.delete(key);
  }

  while (store.size > MAX_TRACKED_KEYS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Status terkini tanpa mengubah hitungan. */
export function peekLoginThrottle(key: string): ThrottleState {
  const at = Date.now();
  const entry = store.get(key);
  if (!entry) {
    return { blocked: false, retryAfterSeconds: 0, remaining: MAX_LOGIN_FAILURES };
  }
  return toState(entry, at);
}

/**
 * Catat satu kegagalan. Mengembalikan status **sesudah** pencatatan, jadi
 * pemanggil bisa langsung tahu apakah IP-nya baru saja dikunci.
 */
export function recordLoginFailure(key: string): ThrottleState {
  const at = Date.now();
  prune(at);

  let entry = store.get(key);

  // Entri lama: kunci sudah lewat, atau jendela hitung sudah lewat → mulai baru.
  if (!entry || (entry.lockedUntil <= at && at - entry.windowStart > LOGIN_WINDOW_MS)) {
    entry = { failures: 0, windowStart: at, lockedUntil: 0 };
  }

  entry.failures += 1;
  if (entry.failures >= MAX_LOGIN_FAILURES) {
    entry.lockedUntil = at + LOGIN_LOCK_MS;
  }
  store.set(key, entry);

  return toState(entry, at);
}

/** Login berhasil → lupakan seluruh kegagalan IP ini. */
export function clearLoginThrottle(key: string): void {
  store.delete(key);
}

/** Hanya untuk pengujian: kosongkan seluruh catatan. */
export function resetLoginThrottleStore(): void {
  store.clear();
}

/**
 * Kunci pembatas: IP klien di belakang proxy, atau `unknown` bila header tidak
 * ada (mis. diakses langsung tanpa reverse proxy).
 */
export function loginThrottleKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  return first || real || "unknown";
}

/** "15 menit", "45 detik" — dipakai di pesan ke pengguna. */
export function formatRetryAfter(seconds: number): string {
  if (seconds <= 0) return "sebentar lagi";
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} menit`;
}

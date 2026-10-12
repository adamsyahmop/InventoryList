/** Gabungkan className secara kondisional tanpa dependency tambahan. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Normalisasi teks untuk kolom `searchKey`.
 * Dipakai supaya pencarian case-insensitive berperilaku identik di
 * SQLite maupun PostgreSQL.
 */
export function buildSearchKey(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .toLowerCase();
}

/** Ambil nilai pertama dari searchParams yang bisa berupa array. */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}


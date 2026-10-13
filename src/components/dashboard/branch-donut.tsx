import { formatNumber } from "@/lib/format";

/**
 * Donut chart sebaran JUMLAH barang per cabang.
 *
 * Sengaja digambar dengan SVG biasa (tanpa library chart) supaya tetap bisa
 * dirender di server component dan tidak menambah dependency. Nilai warna
 * ditulis inline karena class Tailwind yang dibentuk dari string dinamis tidak
 * ikut ter-generate oleh compiler.
 */

export type BranchSlice = {
  id: string | null;
  name: string;
  count: number;
  value: number;
};

/** Palet warna; dipakai berurutan lalu berulang bila cabangnya lebih banyak. */
const SLICE_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#14b8a6", // teal
  "#f97316", // orange
];

/** Sisanya digabung jadi satu irisan supaya legenda tidak memanjang. */
const MAX_SLICES = 6;

type Slice = {
  key: string;
  label: string;
  count: number;
  color: string;
  percent: number;
  /** Titik mulai irisan pada skala 0-100 dari jam 12 searah jarum jam. */
  start: number;
};

function buildSlices(rows: BranchSlice[]): Slice[] {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, MAX_SLICES);
  const tail = sorted.slice(MAX_SLICES);

  const groups = head.map((row, index) => ({
    key: row.id ?? `branch-${index}`,
    label: row.name,
    count: row.count,
    color: SLICE_COLORS[index % SLICE_COLORS.length],
  }));

  if (tail.length > 0) {
    groups.push({
      key: "branch-lainnya",
      label: `Cabang lain (${formatNumber(tail.length)})`,
      count: tail.reduce((sum, row) => sum + row.count, 0),
      color: SLICE_COLORS[groups.length % SLICE_COLORS.length],
    });
  }

  const total = groups.reduce((sum, group) => sum + group.count, 0);
  let start = 0;

  return groups
    .filter((group) => group.count > 0)
    .map((group) => {
      const percent = total > 0 ? (group.count / total) * 100 : 0;
      const slice = { ...group, percent, start };
      start += percent;
      return slice;
    });
}

export function BranchDonut({ rows }: { rows: BranchSlice[] }) {
  const slices = buildSlices(rows);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  if (total === 0) {
    return <p className="text-sm text-neutral-500">Belum ada data.</p>;
  }

  // Celah kecil antar irisan supaya batas warnanya terlihat.
  const gap = slices.length > 1 ? 1 : 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 42 42"
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label={`Sebaran ${formatNumber(total)} jenis barang per cabang`}
      >
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <g transform="rotate(-90 21 21)">
          {slices.map((slice) => {
            const dash = Math.max(slice.percent - gap, 0.6);
            return (
              <circle
                key={slice.key}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke={slice.color}
                strokeWidth="5"
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={-slice.start}
              />
            );
          })}
        </g>
        <text
          x="21"
          y="20.6"
          textAnchor="middle"
          fontSize="5.4"
          fontWeight="600"
          fill="#171717"
        >
          {formatNumber(total)}
        </text>
        <text x="21" y="25" textAnchor="middle" fontSize="2.7" fill="#a3a3a3">
          jenis barang
        </text>
      </svg>

      <ul className="flex w-full min-w-0 flex-col gap-2">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">
              {slice.label}
            </span>
            <span className="shrink-0 text-sm font-medium text-neutral-800">
              {formatNumber(slice.count)}
            </span>
            <span className="w-9 shrink-0 text-right text-xs text-neutral-400">
              {Math.round(slice.percent)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

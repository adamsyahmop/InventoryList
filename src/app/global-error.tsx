"use client";

/**
 * Fallback terakhir: dipakai kalau `app/layout.tsx` sendiri gagal dirender,
 * sehingga root layout digantikan sepenuhnya.
 *
 * Karena itu file ini WAJIB menyediakan `<html>`/`<body>` sendiri. Gaya di sini
 * sengaja memakai inline style, bukan kelas Tailwind: `globals.css` diimpor oleh
 * root layout yang sedang gagal, jadi tidak ada jaminan stylesheet-nya termuat.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1rem",
          background: "#fafafa",
          color: "#171717",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ width: "100%", maxWidth: "28rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
            Aplikasi gagal dimuat
          </h1>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "#525252" }}>
            Terjadi kesalahan saat menyiapkan halaman. Coba lagi; kalau tetap
            gagal, periksa koneksi database.
          </p>
          <p
            style={{
              margin: "1rem 0 0",
              padding: "0.5rem 0.75rem",
              border: "1px solid #fecaca",
              borderRadius: "0.5rem",
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: "0.8125rem",
              overflowWrap: "anywhere",
            }}
          >
            {error.message || "Kesalahan tanpa pesan."}
            {error.digest ? ` (kode: ${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: "0.5rem",
              background: "#4f46e5",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}

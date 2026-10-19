import type { Metadata } from "next";
import { ItemImportForm } from "@/components/items/item-import-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { IMPORT_MAX_ROWS } from "@/lib/item-import";

export const metadata: Metadata = { title: "Impor Barang" };

export default function ImportItemsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Impor Barang"
        description="Tambahkan banyak barang sekaligus dari berkas .xlsx."
        action={
          <ButtonLink href="/items" variant="outline">
            ← Daftar barang
          </ButtonLink>
        }
      />

      <Card className="flex flex-col gap-3 p-5 text-sm text-neutral-700">
        <p className="font-medium text-neutral-900">Format berkas</p>
        <p>
          Cara paling aman: klik <strong>Ekspor .xlsx</strong> di daftar barang, isi
          baris baru di sheet tahun yang sesuai, lalu impor berkas itu kembali. Judul
          kolom yang dikenali sama dengan hasil ekspor (Kode, Nama, Kategori, Unit
          Pengelola, Merek, Model, Jumlah, Satuan, Harga, Tanggal Beli, Garansi Sampai,
          Kondisi, Status, Lokasi, Sumber Perolehan, Cabang Pembeli, Pemilik Aset,
          Dipegang Oleh, Nomor Seri, No. Invoice, Supplier, Catatan, dan kolom
          pelepasan aset).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Nama</strong> wajib. <strong>Kode</strong> boleh kosong — server
            membuat nomor berikutnya (<code>INV-2026-0011-LPT</code>). Kode yang sudah
            dipakai akan ditolak, bukan ditimpa.
          </li>
          <li>
            Default bila kolom kosong: jumlah <strong>1</strong>, satuan{" "}
            <strong>unit</strong>, harga <strong>0</strong>, kondisi{" "}
            <strong>Baik</strong>, status <strong>Tersedia</strong>, sumber perolehan{" "}
            <strong>Kantor Pusat</strong>.
          </li>
          <li>
            Kategori, merek, unit pengelola, lokasi, supplier, dan cabang dicocokkan{" "}
            <strong>berdasarkan nama</strong> dan harus sudah ada di data master —
            tidak dibuat otomatis, supaya salah ketik tidak jadi data sampah.
          </li>
          <li>
            Tanggal boleh berupa tanggal Excel atau teks <code>dd/mm/yyyy</code>. Maksimal{" "}
            {IMPORT_MAX_ROWS} baris per berkas; sheet yang bukan daftar barang (mis.{" "}
            <em>Ringkasan</em>) dilewati.
          </li>
          <li>Foto barang tidak ikut diimpor — tambahkan lewat halaman detail barang.</li>
        </ul>
      </Card>

      <Card className="p-5">
        <ItemImportForm />
      </Card>
    </div>
  );
}

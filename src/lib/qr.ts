import { headers } from "next/headers";
import QRCode from "qrcode";

/**
 * URL absolut halaman detail barang. QR sengaja menunjuk ke **ID**, bukan kode
 * barang, supaya label yang sudah ditempel di fisik barang tetap mengarah ke
 * data yang benar walau kode atau nama barangnya kemudian diubah.
 */
export function itemDetailUrl(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, "")}/items/${id}`;
}

/**
 * Alamat asal aplikasi diambil dari header request. Catatan: dari HP,
 * `localhost` tidak bisa dibuka — untuk mencoba, akses aplikasi lewat alamat
 * jaringan komputer (mis. `http://192.168.1.10:3000`) atau domain aslinya.
 */
export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");

  return `${proto}://${host}`;
}

/**
 * QR sebagai SVG (string) sehingga bisa langsung ditempel ke HTML tanpa berkas
 * gambar terpisah dan tanpa layanan pihak ketiga.
 */
export async function qrSvg(text: string, size = 168): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    width: size,
    errorCorrectionLevel: "M",
  });
}

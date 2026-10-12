/**
 * Seed data contoh untuk pengembangan.
 *
 * Jalankan dengan: npm run seed
 *
 * Idempotent: seluruh penulisan memakai `upsert` berdasarkan kolom unik,
 * jadi script ini aman dijalankan berkali-kali.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { buildSearchKey } from "../src/lib/utils";
import type {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "../src/generated/prisma/enums";

type SeedItem = {
  code: string;
  name: string;
  model?: string;
  quantity: number;
  unit?: string;
  purchaseDate?: string;
  price: number;
  invoiceNo?: string;
  warrantyUntil?: string;
  condition: ItemCondition;
  status: ItemStatus;
  assignedTo?: string;
  serialNumber?: string;
  notes?: string;
  category: string;
  brand?: string;
  location?: string;
  supplier?: string;
  acquisitionSource?: AcquisitionSource;
  /** Nama cabang pembeli; hanya dipakai bila sumbernya BRANCH. */
  sourceBranch?: string;
  /** Nama cabang pemilik aset. Kosong = milik kantor pusat. */
  ownerBranch?: string;
  disposedAt?: string;
  disposalReason?: string;
  soldAt?: string;
  soldPrice?: number;
  /**
   * Tanggal soft delete. Barang dengan nilai ini muncul di `/items/terhapus`
   * (halaman Sampah) dan disembunyikan dari daftar aktif, dashboard, serta
   * ekspor CSV — nilainya tidak ikut dihitung di total mana pun.
   */
  deletedAt?: string;
};

const BRANCHES = [
  { code: "PST", name: "Kantor Pusat", notes: "Gedung utama." },
  { code: "BDG", name: "Cabang Bandung", notes: "Jalan Asia Afrika." },
  { code: "SBY", name: "Cabang Surabaya", notes: "Jalan Basuki Rahmat." },
];

const CATEGORIES = [
  { name: "Elektronik", code: "ELK", description: "Perangkat komputer dan elektronik." },
  { name: "Furnitur", code: "FRN", description: "Meja, kursi, dan lemari." },
  { name: "Peralatan Kantor", code: "PKT", description: "Alat tulis dan perlengkapan kantor." },
];

const BRANDS = [
  { name: "Dell", notes: "Laptop & monitor" },
  { name: "Asus", notes: "Laptop & router" },
  { name: "Logitech", notes: "Aksesori" },
  { name: "IKEA", notes: "Furnitur" },
  { name: "HP", notes: "Komputer & printer" },
];

const LOCATIONS = [
  { name: "Gudang A", building: "Gedung Utama", floor: "1", room: "A1", branch: "Kantor Pusat" },
  { name: "Ruang Server", building: "Gedung Utama", floor: "2", room: "S2", branch: "Kantor Pusat" },
  { name: "Ruang Meeting", building: "Gedung Utama", floor: "3", room: "M1", branch: "Kantor Pusat" },
  { name: "Gudang Bandung", building: "Gedung Cabang", floor: "1", room: "B1", branch: "Cabang Bandung" },
  { name: "Front Office Surabaya", building: "Gedung Cabang", floor: "1", room: "S1", branch: "Cabang Surabaya" },
];

const SUPPLIERS = [
  {
    name: "PT Sumber Komputer",
    contact: "Budi",
    phone: "021-5550101",
    email: "sales@sumberkomputer.id",
  },
  {
    name: "CV Mitra Furnitur",
    contact: "Sari",
    phone: "021-5550202",
    email: "order@mitrafurnitur.id",
  },
];

/** Tanggal ISO (yyyy-mm-dd) relatif terhadap hari ini. */
function iso(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

const ITEMS: SeedItem[] = [
  {
    code: "INV-2026-0001",
    name: "Laptop Dell Latitude 5440",
    model: "Latitude 5440",
    quantity: 3,
    purchaseDate: iso(-300),
    price: 14500000,
    invoiceNo: "INV/2025/0912",
    warrantyUntil: iso(45),
    condition: "GOOD",
    status: "IN_USE",
    assignedTo: "Divisi IT",
    serialNumber: "DL5440-001",
    category: "Elektronik",
    brand: "Dell",
    location: "Ruang Server",
    supplier: "PT Sumber Komputer",
    acquisitionSource: "HEAD_OFFICE",
  },
  {
    code: "INV-2026-0002",
    name: "Monitor Dell P2422H",
    model: "P2422H",
    quantity: 5,
    purchaseDate: iso(-280),
    price: 2750000,
    warrantyUntil: iso(20),
    condition: "GOOD",
    status: "AVAILABLE",
    category: "Elektronik",
    brand: "Dell",
    location: "Gudang A",
    supplier: "PT Sumber Komputer",
    acquisitionSource: "HEAD_OFFICE",
  },
  {
    code: "INV-2026-0003",
    name: "Router Asus RT-AX58U",
    model: "RT-AX58U",
    quantity: 2,
    purchaseDate: iso(-200),
    price: 1350000,
    warrantyUntil: iso(160),
    condition: "NEW",
    status: "AVAILABLE",
    category: "Elektronik",
    brand: "Asus",
    location: "Gudang A",
    supplier: "PT Sumber Komputer",
    acquisitionSource: "HEAD_OFFICE",
  },
  {
    code: "INV-2026-0004",
    name: "Keyboard Logitech K380",
    model: "K380",
    quantity: 10,
    purchaseDate: iso(-150),
    price: 450000,
    condition: "GOOD",
    status: "BORROWED",
    assignedTo: "Rani",
    category: "Elektronik",
    brand: "Logitech",
    location: "Ruang Meeting",
    supplier: "PT Sumber Komputer",
    acquisitionSource: "HEAD_OFFICE",
  },
  {
    code: "INV-2026-0005",
    name: "Meja Kerja IKEA BEKANT",
    model: "BEKANT 160x80",
    quantity: 4,
    purchaseDate: iso(-500),
    price: 3900000,
    condition: "FAIR",
    status: "AVAILABLE",
    category: "Furnitur",
    brand: "IKEA",
    location: "Gudang Bandung",
    supplier: "CV Mitra Furnitur",
    // Dibeli kantor pusat, tetapi menjadi aset Cabang Bandung.
    acquisitionSource: "HEAD_OFFICE",
    ownerBranch: "Cabang Bandung",
  },
  {
    code: "INV-2026-0006",
    name: "Kursi Ergonomis IKEA MARKUS",
    model: "MARKUS",
    quantity: 6,
    purchaseDate: iso(-480),
    price: 2250000,
    condition: "NEEDS_REPAIR",
    status: "MAINTENANCE",
    notes: "Dua unit hidroliknya bocor.",
    category: "Furnitur",
    brand: "IKEA",
    location: "Gudang Bandung",
    supplier: "CV Mitra Furnitur",
    // Dibeli sendiri oleh cabang, dan tetap menjadi asetnya.
    acquisitionSource: "BRANCH",
    sourceBranch: "Cabang Bandung",
    ownerBranch: "Cabang Bandung",
  },
  {
    code: "INV-2026-0007",
    name: "Proyektor Epson EB-X06",
    model: "EB-X06",
    quantity: 1,
    purchaseDate: iso(-900),
    price: 6800000,
    warrantyUntil: iso(-30),
    condition: "FAIR",
    status: "AVAILABLE",
    category: "Elektronik",
    location: "Front Office Surabaya",
    acquisitionSource: "HEAD_OFFICE",
    ownerBranch: "Cabang Surabaya",
  },
  {
    code: "INV-2026-0008",
    name: "Printer HP LaserJet M111a",
    model: "M111a",
    quantity: 1,
    purchaseDate: iso(-1200),
    price: 1850000,
    condition: "DAMAGED",
    status: "DISPOSED",
    notes: "Sudah tidak ekonomis untuk diperbaiki.",
    category: "Elektronik",
    brand: "HP",
    location: "Gudang A",
    acquisitionSource: "HEAD_OFFICE",
    disposedAt: iso(-90),
    disposalReason: "Tidak ekonomis diperbaiki",
  },
  {
    code: "INV-2026-0009",
    name: "PC Desktop HP ProDesk 400",
    model: "ProDesk 400 G9",
    quantity: 2,
    purchaseDate: iso(-1100),
    price: 5200000,
    invoiceNo: "INV/2024/0311",
    condition: "FAIR",
    status: "SOLD",
    notes: "Dijual borongan setelah penggantian unit.",
    category: "Elektronik",
    brand: "HP",
    location: "Gudang A",
    supplier: "PT Sumber Komputer",
    acquisitionSource: "HEAD_OFFICE",
    soldAt: iso(-45),
    soldPrice: 3500000,
  },
  {
    // Fixture untuk halaman Sampah: satu barang yang sengaja sudah dihapus
    // (soft delete). Karena `deletedAt` terisi, baris ini tidak dihitung di
    // dashboard, daftar barang, maupun ekspor CSV — angka seed yang
    // didokumentasikan di README tetap sama.
    code: "INV-2026-0010",
    name: "Lemari Arsip Besi Lion",
    model: "L-42",
    quantity: 2,
    purchaseDate: iso(-1500),
    price: 1750000,
    condition: "DAMAGED",
    status: "DISPOSED",
    notes: "Dihapus dari daftar aktif setelah dibuang.",
    category: "Peralatan Kantor",
    location: "Gudang A",
    acquisitionSource: "HEAD_OFFICE",
    disposedAt: iso(-20),
    disposalReason: "Rusak berat",
    deletedAt: iso(-10),
  },
];

async function main() {
  for (const data of BRANCHES) {
    await prisma.branch.upsert({
      where: { code: data.code },
      update: { name: data.name, notes: data.notes },
      create: data,
    });
  }
  for (const data of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: data.name },
      update: { code: data.code, description: data.description },
      create: data,
    });
  }
  for (const data of BRANDS) {
    await prisma.brand.upsert({
      where: { name: data.name },
      update: { notes: data.notes },
      create: data,
    });
  }

  const branches = await prisma.branch.findMany();
  const branchByName = new Map(branches.map((row) => [row.name, row] as const));
  const branchById = new Map(branches.map((row) => [row.id, row] as const));

  for (const data of LOCATIONS) {
    const { branch, ...rest } = data;
    const payload = {
      ...rest,
      branchId: branch ? (branchByName.get(branch)?.id ?? null) : null,
    };
    const existing = await prisma.location.findFirst({
      where: { name: data.name },
    });
    if (existing) {
      await prisma.location.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.location.create({ data: payload });
    }
  }
  for (const data of SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { name: data.name },
      update: data,
      create: data,
    });
  }

  const [categories, brands, locations, suppliers] = await Promise.all([
    prisma.category.findMany(),
    prisma.brand.findMany(),
    prisma.location.findMany(),
    prisma.supplier.findMany(),
  ]);
  const byName = <T extends { name: string }>(rows: T[]) =>
    new Map(rows.map((row) => [row.name, row] as const));

  const categoryMap = byName(categories);
  const brandMap = byName(brands);
  const locationMap = byName(locations);
  const supplierMap = byName(suppliers);

  for (const item of ITEMS) {
    const category = categoryMap.get(item.category);
    const brand = item.brand ? brandMap.get(item.brand) : undefined;
    const location = item.location ? locationMap.get(item.location) : undefined;
    const supplier = item.supplier ? supplierMap.get(item.supplier) : undefined;
    const sourceBranch = item.sourceBranch
      ? branchByName.get(item.sourceBranch)
      : undefined;
    const ownerBranch = item.ownerBranch
      ? branchByName.get(item.ownerBranch)
      : undefined;
    const acquisitionSource = item.acquisitionSource ?? "HEAD_OFFICE";

    const shared = {
      name: item.name,
      model: item.model ?? null,
      quantity: item.quantity,
      unit: item.unit ?? "pcs",
      purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
      price: item.price,
      invoiceNo: item.invoiceNo ?? null,
      warrantyUntil: item.warrantyUntil ? new Date(item.warrantyUntil) : null,
      condition: item.condition,
      status: item.status,
      assignedTo: item.assignedTo ?? null,
      serialNumber: item.serialNumber ?? null,
      notes: item.notes ?? null,
      categoryId: category?.id ?? null,
      brandId: brand?.id ?? null,
      locationId: location?.id ?? null,
      supplierId: supplier?.id ?? null,
      acquisitionSource,
      // Cabang pembeli hanya disimpan bila barang memang dibeli cabang.
      sourceBranchId:
        acquisitionSource === "BRANCH" ? (sourceBranch?.id ?? null) : null,
      ownerBranchId: ownerBranch?.id ?? null,
      disposedAt: item.disposedAt ? new Date(item.disposedAt) : null,
      disposalReason: item.disposalReason ?? null,
      soldAt: item.soldAt ? new Date(item.soldAt) : null,
      soldPrice: item.soldPrice ?? null,
      // Seed mengembalikan isi Sampah ke kondisi awal, sehingga smoke test
      // (yang memulihkan lalu menghapus lagi satu barang) tetap deterministik
      // walau dijalankan berkali-kali.
      deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
      searchKey: buildSearchKey(
        item.code,
        item.name,
        item.model,
        item.serialNumber,
        item.invoiceNo,
        item.assignedTo,
        item.notes,
        item.disposalReason,
        category?.name,
        brand?.name,
        location?.name,
        location?.branchId ? branchById.get(location.branchId)?.name : undefined,
        location?.branchId ? branchById.get(location.branchId)?.code : undefined,
        supplier?.name,
        acquisitionSource === "BRANCH" ? sourceBranch?.name : undefined,
        acquisitionSource === "BRANCH" ? sourceBranch?.code : undefined,
        ownerBranch?.name,
        ownerBranch?.code,
      ),
    };

    await prisma.item.upsert({
      where: { code: item.code },
      update: shared,
      create: { ...shared, code: item.code, createdBy: "seed" },
    });
  }

  const first = await prisma.item.findUnique({
    where: { code: "INV-2026-0001" },
  });
  const sixth = await prisma.item.findUnique({
    where: { code: "INV-2026-0006" },
  });
  const gudang = locationMap.get("Gudang A");
  const server = locationMap.get("Ruang Server");
  const gudangBandung = locationMap.get("Gudang Bandung");

  if (first && gudang && server) {
    const existing = await prisma.itemMovement.count({
      where: { itemId: first.id },
    });
    if (existing === 0) {
      await prisma.itemMovement.create({
        data: {
          itemId: first.id,
          fromLocationId: gudang.id,
          toLocationId: server.id,
          fromStatus: "AVAILABLE",
          toStatus: "IN_USE",
          quantity: 3,
          reason: "Penyerahan ke Divisi IT",
          movedBy: "admin",
        },
      });
    }
  }

  if (sixth && gudang && gudangBandung) {
    const existing = await prisma.itemMovement.count({
      where: { itemId: sixth.id },
    });
    if (existing === 0) {
      await prisma.itemMovement.create({
        data: {
          itemId: sixth.id,
          fromLocationId: gudang.id,
          toLocationId: gudangBandung.id,
          fromStatus: "AVAILABLE",
          toStatus: "MAINTENANCE",
          quantity: 2,
          reason: "Perbaikan hidrolik",
          notes: "Menunggu sparepart.",
          movedBy: "admin",
        },
      });
    }
  }

  const [itemCount, movementCount] = await Promise.all([
    prisma.item.count(),
    prisma.itemMovement.count(),
  ]);
  console.log(
    `Seed selesai: ${branches.length} cabang, ${categories.length} kategori, ` +
      `${brands.length} merek, ${locations.length} lokasi, ` +
      `${suppliers.length} supplier, ${itemCount} barang, ` +
      `${movementCount} pergerakan.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


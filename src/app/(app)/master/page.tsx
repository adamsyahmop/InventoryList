import { Suspense } from "react";
import type { Metadata } from "next";
import {
  MasterManager,
  type MasterFieldDef,
  type MasterRow,
} from "@/components/master/master-manager";
import { Card, PageHeader } from "@/components/ui/card";
import {
  deleteBranchAction,
  deleteBrandAction,
  deleteCategoryAction,
  deleteDepartmentAction,
  deleteLocationAction,
  deleteSupplierAction,
  saveBranchAction,
  saveBrandAction,
  saveCategoryAction,
  saveDepartmentAction,
  saveLocationAction,
  saveSupplierAction,
} from "@/lib/actions/master";
import { getSession } from "@/lib/auth";
import { getMasterData } from "@/lib/queries";

export const metadata: Metadata = { title: "Data Master" };

const BRANCH_FIELDS: MasterFieldDef[] = [
  { name: "name", label: "Nama cabang", required: true, placeholder: "Cabang Bandung" },
  { name: "code", label: "Kode cabang", required: true, placeholder: "BDG" },
  { name: "notes", label: "Catatan", type: "textarea" },
];

const DEPARTMENT_FIELDS: MasterFieldDef[] = [
  { name: "name", label: "Nama unit", required: true, placeholder: "IT" },
  { name: "code", label: "Kode unit", required: true, placeholder: "IT" },
  { name: "notes", label: "Catatan", type: "textarea" },
];

const CATEGORY_FIELDS: MasterFieldDef[] = [
  { name: "name", label: "Nama kategori", required: true, placeholder: "Elektronik" },
  { name: "code", label: "Kode", placeholder: "ELK" },
  // Dipakai laporan nilai buku. Dikosongkan = ikut bawaan
  // `DEFAULT_USEFUL_LIFE_MONTHS` (48 bulan), lihat `src/lib/depreciation.ts`.
  {
    name: "usefulLifeMonths",
    label: "Umur ekonomis (bulan)",
    type: "number",
    placeholder: "48",
  },
  { name: "description", label: "Deskripsi", type: "textarea" },
];

const BRAND_FIELDS: MasterFieldDef[] = [
  { name: "name", label: "Nama merek", required: true, placeholder: "Dell" },
  { name: "notes", label: "Catatan", type: "textarea" },
];

/**
 * Opsi "Cabang" pada lokasi diisi dari data cabang, jadi daftar field ini
 * disusun ulang di dalam komponen async, bukan sebagai konstanta statis.
 */
const LOCATION_FIELDS: MasterFieldDef[] = [
  { name: "name", label: "Nama lokasi", required: true, placeholder: "Gudang A" },
  { name: "building", label: "Gedung" },
  { name: "floor", label: "Lantai" },
  { name: "room", label: "Ruangan" },
  { name: "branchId", label: "Cabang", type: "select" },
  { name: "notes", label: "Catatan", type: "textarea" },
];

const SUPPLIER_FIELDS: MasterFieldDef[] = [
  { name: "name", label: "Nama supplier", required: true, placeholder: "PT Sumber Komputer" },
  { name: "contact", label: "Narahubung" },
  { name: "phone", label: "Telepon" },
  { name: "email", label: "Email", type: "email", placeholder: "sales@contoh.id" },
  { name: "address", label: "Alamat", type: "textarea" },
  { name: "notes", label: "Catatan", type: "textarea" },
];

/** Gabungkan bagian yang terisi menjadi satu baris keterangan. */
function joinMeta(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ") || undefined;
}

function MasterSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <Card key={index} className="h-56 animate-pulse bg-neutral-100" />
      ))}
    </div>
  );
}

async function MasterData() {
  // Hanya admin yang boleh mengubah data master; peran lain melihat daftar saja.
  const actor = await getSession();
  const canManage = actor?.role === "ADMIN";

  const { categories, departments, brands, locations, suppliers, branches } =
    await getMasterData();

  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const branchLabel = (branchId: string | null) =>
    branchId ? (branchNames.get(branchId) ?? "Cabang tidak dikenal") : null;

  const locationFields: MasterFieldDef[] = LOCATION_FIELDS.map((field) =>
    field.name === "branchId"
      ? {
          ...field,
          options: [
            { value: "", label: "— Tanpa cabang —" },
            ...branches.map((branch) => ({
              value: branch.id,
              label: `${branch.name} (${branch.code})`,
            })),
          ],
        }
      : field,
  );

  const branchRows: MasterRow[] = branches.map((branch) => ({
    id: branch.id,
    label: branch.name,
    meta: joinMeta(branch.code, branch.notes),
    values: {
      name: branch.name,
      code: branch.code,
      notes: branch.notes ?? "",
    },
  }));

  const departmentRows: MasterRow[] = departments.map((department) => ({
    id: department.id,
    label: department.name,
    meta: joinMeta(department.code, department.notes),
    values: {
      name: department.name,
      code: department.code,
      notes: department.notes ?? "",
    },
  }));

  const categoryRows: MasterRow[] = categories.map((category) => ({
    id: category.id,
    label: category.name,
    meta: joinMeta(
      category.code,
      category.usefulLifeMonths
        ? `susut ${category.usefulLifeMonths} bln`
        : "susut 48 bln (bawaan)",
      category.description,
    ),
    values: {
      name: category.name,
      code: category.code ?? "",
      description: category.description ?? "",
      usefulLifeMonths: category.usefulLifeMonths
        ? String(category.usefulLifeMonths)
        : "",
    },
  }));

  const brandRows: MasterRow[] = brands.map((brand) => ({
    id: brand.id,
    label: brand.name,
    meta: joinMeta(brand.notes),
    values: { name: brand.name, notes: brand.notes ?? "" },
  }));

  const locationRows: MasterRow[] = locations.map((location) => ({
    id: location.id,
    label: location.name,
    meta: joinMeta(
      location.building,
      location.floor,
      location.room,
      branchLabel(location.branchId),
      location.notes,
    ),
    values: {
      name: location.name,
      building: location.building ?? "",
      floor: location.floor ?? "",
      room: location.room ?? "",
      branchId: location.branchId ?? "",
      notes: location.notes ?? "",
    },
  }));

  const supplierRows: MasterRow[] = suppliers.map((supplier) => ({
    id: supplier.id,
    label: supplier.name,
    meta: joinMeta(supplier.contact, supplier.phone, supplier.email),
    values: {
      name: supplier.name,
      contact: supplier.contact ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      <MasterManager
        canManage={canManage}
        title="Cabang"
        description="Unit kerja pemilik aset. Dipakai pada barang (sumber & pemilik) dan lokasi."
        fields={BRANCH_FIELDS}
        rows={branchRows}
        saveAction={saveBranchAction}
        deleteAction={deleteBranchAction}
        emptyText="Belum ada cabang."
      />
      <MasterManager
        canManage={canManage}
        title="Unit pengelola"
        description="Unit yang memakai & merawat barang (mis. IT, GA). Dimensi terpisah dari kategori dan cabang."
        fields={DEPARTMENT_FIELDS}
        rows={departmentRows}
        saveAction={saveDepartmentAction}
        deleteAction={deleteDepartmentAction}
        emptyText="Belum ada unit pengelola."
      />
      <MasterManager
        canManage={canManage}
        title="Kategori"
        description="Pengelompokan jenis barang."
        fields={CATEGORY_FIELDS}
        rows={categoryRows}
        saveAction={saveCategoryAction}
        deleteAction={deleteCategoryAction}
        emptyText="Belum ada kategori."
      />
      <MasterManager
        canManage={canManage}
        title="Merek"
        description="Produsen atau merek dagang barang."
        fields={BRAND_FIELDS}
        rows={brandRows}
        saveAction={saveBrandAction}
        deleteAction={deleteBrandAction}
        emptyText="Belum ada merek."
      />
      <MasterManager
        canManage={canManage}
        title="Lokasi"
        description="Tempat penyimpanan barang, bisa ditautkan ke satu cabang."
        fields={locationFields}
        rows={locationRows}
        saveAction={saveLocationAction}
        deleteAction={deleteLocationAction}
        emptyText="Belum ada lokasi."
      />
      <MasterManager
        canManage={canManage}
        title="Supplier"
        description="Pemasok barang inventaris."
        fields={SUPPLIER_FIELDS}
        rows={supplierRows}
        saveAction={saveSupplierAction}
        deleteAction={deleteSupplierAction}
        emptyText="Belum ada supplier."
      />
    </div>
  );
}

export default function MasterPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Data Master"
        description="Kelola unit pengelola, cabang, kategori, merek, lokasi, dan supplier yang dipakai pada form barang."
      />
      <Suspense fallback={<MasterSkeleton />}>
        <MasterData />
      </Suspense>
    </div>
  );
}

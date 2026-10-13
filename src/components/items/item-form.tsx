"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  AcquisitionSource,
  ItemCondition,
  ItemStatus,
} from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/action-utils";
import { createItemAction, updateItemAction } from "@/lib/actions/items";
import {
  ACQUISITION_SOURCE_LABELS,
  DISPOSAL_REASON_OPTIONS,
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_LABELS,
  ITEM_TYPE_LABELS,
  ITEM_TYPE_VALUES,
  UNIT_OPTIONS,
  isInactiveStatus,
} from "@/lib/constants";

export type ItemFormValues = {
  id: string;
  code: string;
  assetType: string;
  name: string;
  brandId: string;
  model: string;
  categoryId: string;
  departmentId: string;
  quantity: string;
  unit: string;
  purchaseDate: string;
  price: string;
  supplierId: string;
  invoiceNo: string;
  warrantyUntil: string;
  condition: ItemCondition;
  status: ItemStatus;
  locationId: string;
  assignedTo: string;
  serialNumber: string;
  photoUrl: string;
  notes: string;
  acquisitionSource: AcquisitionSource;
  sourceBranchId: string;
  ownerBranchId: string;
  disposedAt: string;
  disposalReason: string;
  soldAt: string;
  soldPrice: string;
};

export const EMPTY_ITEM_FORM: ItemFormValues = {
  id: "",
  code: "",
  assetType: "",
  name: "",
  brandId: "",
  model: "",
  categoryId: "",
  departmentId: "",
  quantity: "1",
  unit: "pcs",
  purchaseDate: "",
  price: "0",
  supplierId: "",
  invoiceNo: "",
  warrantyUntil: "",
  condition: ItemCondition.GOOD,
  status: ItemStatus.AVAILABLE,
  locationId: "",
  assignedTo: "",
  serialNumber: "",
  photoUrl: "",
  notes: "",
  acquisitionSource: AcquisitionSource.HEAD_OFFICE,
  sourceBranchId: "",
  ownerBranchId: "",
  disposedAt: "",
  disposalReason: "",
  soldAt: "",
  soldPrice: "",
};

type MasterOption = { id: string; name: string };

export type MasterOptions = {
  categories: MasterOption[];
  departments: MasterOption[];
  brands: MasterOption[];
  locations: MasterOption[];
  suppliers: MasterOption[];
  branches: MasterOption[];
};

const INITIAL_STATE: ActionState = { ok: false };

export function ItemForm({
  mode,
  master,
  values = EMPTY_ITEM_FORM,
}: {
  mode: "create" | "edit";
  master: MasterOptions;
  values?: ItemFormValues;
}) {
  const action = mode === "create" ? createItemAction : updateItemAction;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    INITIAL_STATE,
  );

  const errorOf = (field: string) => state.fieldErrors?.[field];

  // Status & sumber perolehan dikendalikan state supaya field yang tidak
  // relevan (mis. tanggal jual untuk barang yang masih dipakai) tidak ikut
  // ditampilkan. Server tetap menyelaraskan metadata pelepasan dengan status.
  const [status, setStatus] = useState<ItemStatus>(values.status);
  const [source, setSource] = useState<AcquisitionSource>(
    values.acquisitionSource,
  );
  const showDisposal = isInactiveStatus(status);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "edit" ? <input type="hidden" name="id" value={values.id} /> : null}

      {state.message && !state.fieldErrors ? (
        <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Identitas barang"
          description="Kode unik dan nama dipakai untuk pencarian cepat."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Kode barang"
            htmlFor="code"
            error={errorOf("code")}
            hint="Kosongkan untuk dibuat otomatis, mis. INV-2026-0011-LPT"
          >
            <Input
              id="code"
              name="code"
              defaultValue={values.code}
              placeholder="INV-2026-0011-LPT"
              invalid={Boolean(errorOf("code"))}
            />
          </Field>

          <Field
            label="Jenis barang"
            htmlFor="assetType"
            error={errorOf("assetType")}
            hint="Dipakai sebagai akhiran kode otomatis."
          >
            <Select
              id="assetType"
              name="assetType"
              defaultValue={values.assetType}
              invalid={Boolean(errorOf("assetType"))}
            >
              <option value="">— Tanpa jenis —</option>
              {ITEM_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {ITEM_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Nama barang" htmlFor="name" required error={errorOf("name")} className="sm:col-span-2">
            <Input
              id="name"
              name="name"
              defaultValue={values.name}
              placeholder="Laptop Dell Latitude 5440"
              invalid={Boolean(errorOf("name"))}
              required
            />
          </Field>

          <Field label="Kategori" htmlFor="categoryId" error={errorOf("categoryId")}>
            <Select id="categoryId" name="categoryId" defaultValue={values.categoryId}>
              <option value="">— Tanpa kategori —</option>
              {master.categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Merek" htmlFor="brandId" error={errorOf("brandId")}>
            <Select id="brandId" name="brandId" defaultValue={values.brandId}>
              <option value="">— Tanpa merek —</option>
              {master.brands.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Model / tipe" htmlFor="model" error={errorOf("model")}>
            <Input id="model" name="model" defaultValue={values.model} placeholder="Latitude 5440" />
          </Field>

          <Field label="Nomor seri" htmlFor="serialNumber" error={errorOf("serialNumber")}>
            <Input id="serialNumber" name="serialNumber" defaultValue={values.serialNumber} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Pembelian"
          description="Harga disimpan sebagai bilangan bulat rupiah tanpa desimal."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tanggal beli" htmlFor="purchaseDate" error={errorOf("purchaseDate")}>
            <Input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              defaultValue={values.purchaseDate}
              invalid={Boolean(errorOf("purchaseDate"))}
            />
          </Field>

          <Field label="Harga satuan (Rp)" htmlFor="price" required error={errorOf("price")}>
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step={1}
              defaultValue={values.price}
              invalid={Boolean(errorOf("price"))}
              required
            />
          </Field>

          <Field label="Jumlah" htmlFor="quantity" required error={errorOf("quantity")}>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              step={1}
              defaultValue={values.quantity}
              invalid={Boolean(errorOf("quantity"))}
              required
            />
          </Field>

          <Field label="Satuan" htmlFor="unit" required error={errorOf("unit")}>
            <Input
              id="unit"
              name="unit"
              list="unit-options"
              defaultValue={values.unit}
              invalid={Boolean(errorOf("unit"))}
              required
            />
            <datalist id="unit-options">
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </Field>

          <Field label="Supplier" htmlFor="supplierId" error={errorOf("supplierId")}>
            <Select id="supplierId" name="supplierId" defaultValue={values.supplierId}>
              <option value="">— Tanpa supplier —</option>
              {master.suppliers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="No. invoice / nota" htmlFor="invoiceNo" error={errorOf("invoiceNo")}>
            <Input id="invoiceNo" name="invoiceNo" defaultValue={values.invoiceNo} />
          </Field>

          <Field
            label="Garansi sampai"
            htmlFor="warrantyUntil"
            error={errorOf("warrantyUntil")}
            hint="Kosongkan bila tidak bergaransi."
          >
            <Input
              id="warrantyUntil"
              name="warrantyUntil"
              type="date"
              defaultValue={values.warrantyUntil}
              invalid={Boolean(errorOf("warrantyUntil"))}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Perolehan & kepemilikan"
          description="Pisahkan barang yang dibeli kantor pusat dari yang dibeli cabang. Beda hal dengan kategori (barang apa) dan lokasi (barang di mana)."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Sumber perolehan"
            htmlFor="acquisitionSource"
            required
            error={errorOf("acquisitionSource")}
            hint="Siapa yang membeli / membiayai."
          >
            <Select
              id="acquisitionSource"
              name="acquisitionSource"
              value={source}
              onChange={(event) =>
                setSource(event.target.value as AcquisitionSource)
              }
              invalid={Boolean(errorOf("acquisitionSource"))}
            >
              {Object.values(AcquisitionSource).map((value) => (
                <option key={value} value={value}>
                  {ACQUISITION_SOURCE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          {source === AcquisitionSource.BRANCH ? (
            <Field
              label="Cabang pembeli"
              htmlFor="sourceBranchId"
              required
              error={errorOf("sourceBranchId")}
            >
              <Select
                id="sourceBranchId"
                name="sourceBranchId"
                defaultValue={values.sourceBranchId}
                invalid={Boolean(errorOf("sourceBranchId"))}
                required
              >
                <option value="">— Pilih cabang —</option>
                {master.branches.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="sourceBranchId" value="" />
          )}

          <Field
            label="Pemilik aset"
            htmlFor="ownerBranchId"
            error={errorOf("ownerBranchId")}
            hint="Kosongkan bila aset tetap milik kantor pusat."
          >
            <Select
              id="ownerBranchId"
              name="ownerBranchId"
              defaultValue={values.ownerBranchId}
              invalid={Boolean(errorOf("ownerBranchId"))}
            >
              <option value="">— Kantor pusat —</option>
              {master.branches.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Penempatan & status"
          description="Perubahan lokasi atau status lewat form ini otomatis tercatat di riwayat pergerakan."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Lokasi" htmlFor="locationId" error={errorOf("locationId")}>
            <Select id="locationId" name="locationId" defaultValue={values.locationId}>
              <option value="">— Belum ditempatkan —</option>
              {master.locations.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Unit pengelola"
            htmlFor="departmentId"
            error={errorOf("departmentId")}
            hint="Unit yang memakai & merawat barang (mis. IT / GA)."
          >
            <Select
              id="departmentId"
              name="departmentId"
              defaultValue={values.departmentId}
              invalid={Boolean(errorOf("departmentId"))}
            >
              <option value="">— Tanpa unit —</option>
              {master.departments.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status" required error={errorOf("status")}>
            <Select
              id="status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as ItemStatus)}
              invalid={Boolean(errorOf("status"))}
            >
              {Object.values(ItemStatus).map((status) => (
                <option key={status} value={status}>
                  {ITEM_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Kondisi" htmlFor="condition" required error={errorOf("condition")}>
            <Select
              id="condition"
              name="condition"
              defaultValue={values.condition}
              invalid={Boolean(errorOf("condition"))}
            >
              {Object.values(ItemCondition).map((condition) => (
                <option key={condition} value={condition}>
                  {ITEM_CONDITION_LABELS[condition]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Dipegang oleh"
            htmlFor="assignedTo"
            error={errorOf("assignedTo")}
            hint="Nama orang atau bagian yang memakai barang ini."
          >
            <Input id="assignedTo" name="assignedTo" defaultValue={values.assignedTo} />
          </Field>

          <Field label="URL foto" htmlFor="photoUrl" error={errorOf("photoUrl")} className="lg:col-span-2">
            <Input id="photoUrl" name="photoUrl" defaultValue={values.photoUrl} placeholder="https://…" />
          </Field>

          <Field label="Catatan" htmlFor="notes" error={errorOf("notes")} className="sm:col-span-2 lg:col-span-3">
            <Textarea id="notes" name="notes" defaultValue={values.notes} rows={3} />
          </Field>
        </CardBody>
      </Card>

      {showDisposal ? (
        <Card>
          <CardHeader
            title="Pelepasan aset"
            description={
              status === ItemStatus.SOLD
                ? "Barang dijual: catat tanggal dan harga jualnya. Harga perolehan tetap tersimpan untuk audit, hanya dikeluarkan dari nilai aset aktif."
                : "Barang dibuang: catat tanggal dan alasannya. Harga perolehan tetap tersimpan untuk audit, hanya dikeluarkan dari nilai aset aktif."
            }
          />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {status === ItemStatus.SOLD ? (
              <>
                <Field
                  label="Tanggal jual"
                  htmlFor="soldAt"
                  error={errorOf("soldAt")}
                  hint="Kosongkan untuk memakai tanggal hari ini."
                >
                  <Input
                    id="soldAt"
                    name="soldAt"
                    type="date"
                    defaultValue={values.soldAt}
                    invalid={Boolean(errorOf("soldAt"))}
                  />
                </Field>

                <Field
                  label="Harga jual (Rp)"
                  htmlFor="soldPrice"
                  error={errorOf("soldPrice")}
                  hint="Harga aktual saat dijual, bukan harga beli."
                >
                  <Input
                    id="soldPrice"
                    name="soldPrice"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={values.soldPrice}
                    invalid={Boolean(errorOf("soldPrice"))}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field
                  label="Tanggal dibuang"
                  htmlFor="disposedAt"
                  error={errorOf("disposedAt")}
                  hint="Kosongkan untuk memakai tanggal hari ini."
                >
                  <Input
                    id="disposedAt"
                    name="disposedAt"
                    type="date"
                    defaultValue={values.disposedAt}
                    invalid={Boolean(errorOf("disposedAt"))}
                  />
                </Field>

                <Field
                  label="Alasan dibuang"
                  htmlFor="disposalReason"
                  error={errorOf("disposalReason")}
                >
                  <Input
                    id="disposalReason"
                    name="disposalReason"
                    list="disposal-reasons"
                    defaultValue={values.disposalReason}
                    invalid={Boolean(errorOf("disposalReason"))}
                  />
                  <datalist id="disposal-reasons">
                    {DISPOSAL_REASON_OPTIONS.map((reason) => (
                      <option key={reason} value={reason} />
                    ))}
                  </datalist>
                </Field>
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Menyimpan…" : mode === "create" ? "Simpan Barang" : "Simpan Perubahan"}
        </Button>
        <Button type="reset" variant="outline" disabled={isPending}>
          Reset
        </Button>
      </div>
    </form>
  );
}



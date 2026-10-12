-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "purchaseDate" DATETIME,
    "price" INTEGER NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "warrantyUntil" DATETIME,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "assignedTo" TEXT,
    "serialNumber" TEXT,
    "photoUrl" TEXT,
    "notes" TEXT,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "brandId" TEXT,
    "locationId" TEXT,
    "supplierId" TEXT,
    "acquisitionSource" TEXT NOT NULL DEFAULT 'HEAD_OFFICE',
    "sourceBranchId" TEXT,
    "ownerBranchId" TEXT,
    "disposedAt" DATETIME,
    "disposalReason" TEXT,
    "soldAt" DATETIME,
    "soldPrice" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "createdBy" TEXT,
    CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_ownerBranchId_fkey" FOREIGN KEY ("ownerBranchId") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_items" ("assignedTo", "brandId", "categoryId", "code", "condition", "createdAt", "createdBy", "deletedAt", "id", "invoiceNo", "locationId", "model", "name", "notes", "photoUrl", "price", "purchaseDate", "quantity", "searchKey", "serialNumber", "status", "supplierId", "unit", "updatedAt", "warrantyUntil") SELECT "assignedTo", "brandId", "categoryId", "code", "condition", "createdAt", "createdBy", "deletedAt", "id", "invoiceNo", "locationId", "model", "name", "notes", "photoUrl", "price", "purchaseDate", "quantity", "searchKey", "serialNumber", "status", "supplierId", "unit", "updatedAt", "warrantyUntil" FROM "items";
DROP TABLE "items";
ALTER TABLE "new_items" RENAME TO "items";
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");
CREATE INDEX "items_searchKey_idx" ON "items"("searchKey");
CREATE INDEX "items_status_idx" ON "items"("status");
CREATE INDEX "items_categoryId_idx" ON "items"("categoryId");
CREATE INDEX "items_locationId_idx" ON "items"("locationId");
CREATE INDEX "items_sourceBranchId_idx" ON "items"("sourceBranchId");
CREATE INDEX "items_ownerBranchId_idx" ON "items"("ownerBranchId");
CREATE INDEX "items_deletedAt_idx" ON "items"("deletedAt");
CREATE TABLE "new_locations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "building" TEXT,
    "floor" TEXT,
    "room" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "branchId" TEXT,
    CONSTRAINT "locations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_locations" ("building", "createdAt", "floor", "id", "name", "notes", "room", "updatedAt") SELECT "building", "createdAt", "floor", "id", "name", "notes", "room", "updatedAt" FROM "locations";
DROP TABLE "locations";
ALTER TABLE "new_locations" RENAME TO "locations";
CREATE INDEX "locations_name_idx" ON "locations"("name");
CREATE INDEX "locations_branchId_idx" ON "locations"("branchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE INDEX "branches_name_idx" ON "branches"("name");

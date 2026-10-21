-- CreateTable
CREATE TABLE "stock_opnames" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "scopeLabel" TEXT NOT NULL,
    "locationId" TEXT,
    "branchId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "stock_opnames_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_opnames_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_opname_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opnameId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "locationName" TEXT,
    "expectedQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "note" TEXT,
    "countedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_opname_lines_opnameId_fkey" FOREIGN KEY ("opnameId") REFERENCES "stock_opnames" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_opname_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_opnames_code_key" ON "stock_opnames"("code");

-- CreateIndex
CREATE INDEX "stock_opnames_status_idx" ON "stock_opnames"("status");

-- CreateIndex
CREATE INDEX "stock_opnames_startedAt_idx" ON "stock_opnames"("startedAt");

-- CreateIndex
CREATE INDEX "stock_opname_lines_opnameId_idx" ON "stock_opname_lines"("opnameId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opname_lines_opnameId_itemCode_key" ON "stock_opname_lines"("opnameId", "itemCode");

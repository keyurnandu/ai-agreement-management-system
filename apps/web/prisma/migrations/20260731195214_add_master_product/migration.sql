-- CreateTable
CREATE TABLE "MasterProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "side" TEXT NOT NULL DEFAULT 'SALES',
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "manufacturer" TEXT,
    "family" TEXT,
    "unitPrice" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "pricingNotes" TEXT,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceDocumentId" TEXT,
    "sourceDealId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CommercialRecordType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'DEAL',
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CommercialRecordType" ("active", "createdAt", "description", "direction", "domain", "id", "isRoot", "key", "name", "prefix", "sortOrder", "system", "updatedAt") SELECT "active", "createdAt", "description", "direction", "domain", "id", "isRoot", "key", "name", "prefix", "sortOrder", "system", "updatedAt" FROM "CommercialRecordType";
DROP TABLE "CommercialRecordType";
ALTER TABLE "new_CommercialRecordType" RENAME TO "CommercialRecordType";
CREATE UNIQUE INDEX "CommercialRecordType_key_key" ON "CommercialRecordType"("key");
CREATE UNIQUE INDEX "CommercialRecordType_prefix_key" ON "CommercialRecordType"("prefix");
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commercialId" TEXT,
    "commercialTypeId" TEXT,
    "parentContractId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "variables" JSONB,
    "documentId" TEXT,
    "dealId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_commercialTypeId_fkey" FOREIGN KEY ("commercialTypeId") REFERENCES "CommercialRecordType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contract_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("commercialId", "commercialTypeId", "createdAt", "createdById", "dealId", "documentId", "id", "parentContractId", "status", "templateId", "title", "updatedAt", "variables") SELECT "commercialId", "commercialTypeId", "createdAt", "createdById", "dealId", "documentId", "id", "parentContractId", "status", "templateId", "title", "updatedAt", "variables" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE UNIQUE INDEX "Contract_commercialId_key" ON "Contract"("commercialId");
CREATE UNIQUE INDEX "Contract_dealId_key" ON "Contract"("dealId");
CREATE INDEX "Contract_parentContractId_idx" ON "Contract"("parentContractId");
CREATE INDEX "Contract_commercialTypeId_idx" ON "Contract"("commercialTypeId");
CREATE TABLE "new_Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commercialId" TEXT,
    "commercialTypeId" TEXT,
    "recordType" TEXT NOT NULL DEFAULT 'ORDER_FORM',
    "parentDealId" TEXT,
    "title" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ORG_SELLING',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "documentId" TEXT NOT NULL,
    "contractId" TEXT,
    "agreementId" TEXT,
    "ownerId" TEXT NOT NULL,
    "vendorEmail" TEXT NOT NULL,
    "vendorName" TEXT,
    "vendorAccessToken" TEXT NOT NULL,
    "fileTemplateId" TEXT,
    "rulePackId" TEXT,
    "message" TEXT,
    "sentToVendorAt" DATETIME,
    "approvedAt" DATETIME,
    "completedAt" DATETIME,
    "lastDiffFromVersion" INTEGER,
    "lastDiffToVersion" INTEGER,
    "lastDiffSummary" TEXT,
    "lastDiffLines" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_commercialTypeId_fkey" FOREIGN KEY ("commercialTypeId") REFERENCES "CommercialRecordType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_parentDealId_fkey" FOREIGN KEY ("parentDealId") REFERENCES "Deal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_fileTemplateId_fkey" FOREIGN KEY ("fileTemplateId") REFERENCES "FileTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_rulePackId_fkey" FOREIGN KEY ("rulePackId") REFERENCES "ComplianceRulePack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("agreementId", "approvedAt", "commercialId", "commercialTypeId", "completedAt", "contractId", "createdAt", "direction", "documentId", "fileTemplateId", "id", "lastDiffFromVersion", "lastDiffLines", "lastDiffSummary", "lastDiffToVersion", "message", "ownerId", "parentDealId", "recordType", "rulePackId", "sentToVendorAt", "status", "title", "updatedAt", "vendorAccessToken", "vendorEmail", "vendorName") SELECT "agreementId", "approvedAt", "commercialId", "commercialTypeId", "completedAt", "contractId", "createdAt", "direction", "documentId", "fileTemplateId", "id", "lastDiffFromVersion", "lastDiffLines", "lastDiffSummary", "lastDiffToVersion", "message", "ownerId", "parentDealId", "recordType", "rulePackId", "sentToVendorAt", "status", "title", "updatedAt", "vendorAccessToken", "vendorEmail", "vendorName" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE UNIQUE INDEX "Deal_commercialId_key" ON "Deal"("commercialId");
CREATE UNIQUE INDEX "Deal_contractId_key" ON "Deal"("contractId");
CREATE UNIQUE INDEX "Deal_vendorAccessToken_key" ON "Deal"("vendorAccessToken");
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");
CREATE INDEX "Deal_status_idx" ON "Deal"("status");
CREATE INDEX "Deal_parentDealId_idx" ON "Deal"("parentDealId");
CREATE INDEX "Deal_recordType_idx" ON "Deal"("recordType");
CREATE INDEX "Deal_commercialTypeId_idx" ON "Deal"("commercialTypeId");
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'FILE',
    "commercialId" TEXT,
    "commercialTypeId" TEXT,
    "collectionParentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_commercialTypeId_fkey" FOREIGN KEY ("commercialTypeId") REFERENCES "CommercialRecordType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_collectionParentId_fkey" FOREIGN KEY ("collectionParentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("collectionParentId", "commercialId", "commercialTypeId", "createdAt", "description", "id", "kind", "ownerId", "status", "title", "updatedAt") SELECT "collectionParentId", "commercialId", "commercialTypeId", "createdAt", "description", "id", "kind", "ownerId", "status", "title", "updatedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE UNIQUE INDEX "Document_commercialId_key" ON "Document"("commercialId");
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");
CREATE INDEX "Document_collectionParentId_idx" ON "Document"("collectionParentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MasterProduct_side_idx" ON "MasterProduct"("side");

-- CreateIndex
CREATE INDEX "MasterProduct_sku_idx" ON "MasterProduct"("sku");

-- CreateIndex
CREATE INDEX "MasterProduct_sourceDealId_idx" ON "MasterProduct"("sourceDealId");

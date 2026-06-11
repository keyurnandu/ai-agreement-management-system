-- Configurable commercial record types (SMCW, PMCW, custom) and hierarchy links

CREATE TABLE "CommercialRecordType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "CommercialRecordType_key_key" ON "CommercialRecordType"("key");
CREATE UNIQUE INDEX "CommercialRecordType_prefix_key" ON "CommercialRecordType"("prefix");

CREATE TABLE "CommercialTypeLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentTypeId" TEXT NOT NULL,
    "childTypeId" TEXT NOT NULL,
    CONSTRAINT "CommercialTypeLink_parentTypeId_fkey" FOREIGN KEY ("parentTypeId") REFERENCES "CommercialRecordType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommercialTypeLink_childTypeId_fkey" FOREIGN KEY ("childTypeId") REFERENCES "CommercialRecordType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommercialTypeLink_parentTypeId_childTypeId_key" ON "CommercialTypeLink"("parentTypeId", "childTypeId");

-- Seed system types: SMCW, PMCW, SOR, POR
INSERT INTO "CommercialRecordType" ("id", "key", "name", "prefix", "direction", "isRoot", "description", "system", "sortOrder")
VALUES
  ('ctype_smcw', 'smcw', 'Sales Master Contract', 'SMCW', 'ORG_SELLING', true, 'Top-level sales framework agreement', true, 1),
  ('ctype_pmcw', 'pmcw', 'Procurement Master Contract', 'PMCW', 'ORG_BUYING', true, 'Top-level procurement framework agreement', true, 2),
  ('ctype_sor', 'sor', 'Sales Order Form', 'SOR', 'ORG_SELLING', false, 'Order form under a sales master', true, 3),
  ('ctype_por', 'por', 'Procurement Order Form', 'POR', 'ORG_BUYING', false, 'Order form under a procurement master', true, 4);

INSERT INTO "CommercialTypeLink" ("id", "parentTypeId", "childTypeId") VALUES
  ('link_smcw_sor', 'ctype_smcw', 'ctype_sor'),
  ('link_pmcw_por', 'ctype_pmcw', 'ctype_por');

-- Sequences for SMCW/PMCW (migrate counters from SCW/PCW if present)
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal")
SELECT 'SMCW', COALESCE((SELECT "nextVal" FROM "CommercialIdSequence" WHERE "prefix" = 'SCW'), 1)
WHERE NOT EXISTS (SELECT 1 FROM "CommercialIdSequence" WHERE "prefix" = 'SMCW');

INSERT INTO "CommercialIdSequence" ("prefix", "nextVal")
SELECT 'PMCW', COALESCE((SELECT "nextVal" FROM "CommercialIdSequence" WHERE "prefix" = 'PCW'), 1)
WHERE NOT EXISTS (SELECT 1 FROM "CommercialIdSequence" WHERE "prefix" = 'PMCW');

ALTER TABLE "Deal" ADD COLUMN "commercialTypeId" TEXT;

CREATE INDEX "Deal_commercialTypeId_idx" ON "Deal"("commercialTypeId");

-- Map existing deals to new types
UPDATE "Deal" SET "commercialTypeId" = 'ctype_smcw' WHERE "recordType" = 'MASTER_CONTRACT' AND "direction" = 'ORG_SELLING';
UPDATE "Deal" SET "commercialTypeId" = 'ctype_pmcw' WHERE "recordType" = 'MASTER_CONTRACT' AND "direction" = 'ORG_BUYING';
UPDATE "Deal" SET "commercialTypeId" = 'ctype_sor' WHERE "recordType" = 'ORDER_FORM' AND "direction" = 'ORG_SELLING';
UPDATE "Deal" SET "commercialTypeId" = 'ctype_por' WHERE "recordType" = 'ORDER_FORM' AND "direction" = 'ORG_BUYING';

-- Rewrite legacy commercial IDs SCW-* -> SMCW-*, PCW-* -> PMCW-*
UPDATE "Deal" SET "commercialId" = 'SMCW-' || SUBSTR("commercialId", 5) WHERE "commercialId" LIKE 'SCW-%';
UPDATE "Deal" SET "commercialId" = 'PMCW-' || SUBSTR("commercialId", 5) WHERE "commercialId" LIKE 'PCW-%';

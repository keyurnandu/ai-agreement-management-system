-- Domain separation + contract/document collection hierarchies

ALTER TABLE "CommercialRecordType" ADD COLUMN "domain" TEXT NOT NULL DEFAULT 'DEAL';
UPDATE "CommercialRecordType" SET "domain" = 'DEAL';

ALTER TABLE "Contract" ADD COLUMN "commercialId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "commercialTypeId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "parentContractId" TEXT;

CREATE UNIQUE INDEX "Contract_commercialId_key" ON "Contract"("commercialId");
CREATE INDEX "Contract_parentContractId_idx" ON "Contract"("parentContractId");
CREATE INDEX "Contract_commercialTypeId_idx" ON "Contract"("commercialTypeId");

ALTER TABLE "Document" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FILE';
ALTER TABLE "Document" ADD COLUMN "commercialId" TEXT;
ALTER TABLE "Document" ADD COLUMN "commercialTypeId" TEXT;
ALTER TABLE "Document" ADD COLUMN "collectionParentId" TEXT;

CREATE UNIQUE INDEX "Document_commercialId_key" ON "Document"("commercialId");
CREATE INDEX "Document_collectionParentId_idx" ON "Document"("collectionParentId");

-- Contract domain types (structured authoring — separate ID space from Deals)
INSERT INTO "CommercialRecordType" ("id", "key", "name", "prefix", "direction", "domain", "isRoot", "description", "system", "sortOrder")
VALUES
  ('ctype_csmcw', 'csmcw', 'Contract Sales Master', 'CSMCW', 'ORG_SELLING', 'CONTRACT', true, 'Structured sales master contract', true, 10),
  ('ctype_cpmcw', 'cpmcw', 'Contract Procurement Master', 'CPMCW', 'ORG_BUYING', 'CONTRACT', true, 'Structured procurement master contract', true, 11),
  ('ctype_csor', 'csor', 'Contract Sales Order', 'CSOR', 'ORG_SELLING', 'CONTRACT', false, 'Structured sales order under CSMCW', true, 12),
  ('ctype_cpor', 'cpor', 'Contract Procurement Order', 'CPOR', 'ORG_BUYING', 'CONTRACT', false, 'Structured procurement order under CPMCW', true, 13);

INSERT INTO "CommercialTypeLink" ("id", "parentTypeId", "childTypeId") VALUES
  ('link_csmcw_csor', 'ctype_csmcw', 'ctype_csor'),
  ('link_cpmcw_cpor', 'ctype_cpmcw', 'ctype_cpor');

INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('CSMCW', 1);
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('CPMCW', 1);
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('CSOR', 1);
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('CPOR', 1);

-- Document domain: collections (folders) and files
INSERT INTO "CommercialRecordType" ("id", "key", "name", "prefix", "direction", "domain", "isRoot", "description", "system", "sortOrder")
VALUES
  ('ctype_dcol', 'dcol', 'Document Collection', 'DCOL', 'ORG_SELLING', 'DOCUMENT', true, 'PDF collection / folder root', true, 20),
  ('ctype_dpdf', 'dpdf', 'Document File', 'DPDF', 'ORG_SELLING', 'DOCUMENT', false, 'PDF file in a collection', true, 21);

INSERT INTO "CommercialTypeLink" ("id", "parentTypeId", "childTypeId") VALUES
  ('link_dcol_dpdf', 'ctype_dcol', 'ctype_dpdf'),
  ('link_dcol_dcol', 'ctype_dcol', 'ctype_dcol');

INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('DCOL', 1);
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('DPDF', 1);

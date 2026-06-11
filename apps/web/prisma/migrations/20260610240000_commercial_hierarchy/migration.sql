-- Commercial hierarchy: SCW/SOR/PCW/POR IDs and parent/child deals

CREATE TABLE "CommercialIdSequence" (
    "prefix" TEXT NOT NULL PRIMARY KEY,
    "nextVal" INTEGER NOT NULL DEFAULT 1
);

INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('SCW', 1);
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('SOR', 1);
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('PCW', 1);
INSERT INTO "CommercialIdSequence" ("prefix", "nextVal") VALUES ('POR', 1);

ALTER TABLE "Deal" ADD COLUMN "commercialId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "recordType" TEXT NOT NULL DEFAULT 'ORDER_FORM';
ALTER TABLE "Deal" ADD COLUMN "parentDealId" TEXT;

CREATE UNIQUE INDEX "Deal_commercialId_key" ON "Deal"("commercialId");
CREATE INDEX "Deal_parentDealId_idx" ON "Deal"("parentDealId");
CREATE INDEX "Deal_recordType_idx" ON "Deal"("recordType");

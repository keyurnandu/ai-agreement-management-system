-- Link Deal ↔ Contract and allow shared commercial IDs (SMCW-1 on both sides)

ALTER TABLE "Deal" ADD COLUMN "contractId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "dealId" TEXT;

CREATE UNIQUE INDEX "Deal_contractId_key" ON "Deal"("contractId");
CREATE UNIQUE INDEX "Contract_dealId_key" ON "Contract"("dealId");

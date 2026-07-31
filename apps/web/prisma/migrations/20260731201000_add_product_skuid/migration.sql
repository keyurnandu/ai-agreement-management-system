-- Hidden surrogate product key. Nullable + unique so existing rows migrate cleanly
-- (backfilled by app + script); the app always populates it on create.
ALTER TABLE "MasterProduct" ADD COLUMN "skuId" TEXT;
CREATE UNIQUE INDEX "MasterProduct_skuId_key" ON "MasterProduct"("skuId");

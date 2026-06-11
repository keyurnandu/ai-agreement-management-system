ALTER TABLE "Deal" ADD COLUMN "lastDiffFromVersion" INTEGER;
ALTER TABLE "Deal" ADD COLUMN "lastDiffToVersion" INTEGER;
ALTER TABLE "Deal" ADD COLUMN "lastDiffSummary" TEXT;
ALTER TABLE "Deal" ADD COLUMN "lastDiffLines" JSONB;

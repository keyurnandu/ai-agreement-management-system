-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AttributeDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "documentType" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'STRICT',
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "inclusionExamples" JSONB,
    "exclusionExamples" JSONB,
    "scope" TEXT NOT NULL DEFAULT 'BOTH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AttributeDefinition" ("active", "createdAt", "id", "key", "label", "options", "prompt", "scope", "type") SELECT "active", "createdAt", "id", "key", "label", "options", "prompt", "scope", "type" FROM "AttributeDefinition";
DROP TABLE "AttributeDefinition";
ALTER TABLE "new_AttributeDefinition" RENAME TO "AttributeDefinition";
CREATE UNIQUE INDEX "AttributeDefinition_key_key" ON "AttributeDefinition"("key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

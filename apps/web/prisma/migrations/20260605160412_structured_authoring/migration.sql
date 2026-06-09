-- CreateTable
CREATE TABLE "ClauseLibraryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "body" TEXT NOT NULL,
    "fallbacks" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "variables" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TemplateClause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TemplateClause_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateClause_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "ClauseLibraryEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "variables" JSONB,
    "documentId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractClause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceClauseId" TEXT,
    "isDeviation" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ContractClause_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "scope" TEXT NOT NULL DEFAULT 'BOTH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AttributeValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "documentId" TEXT,
    "contractId" TEXT,
    "value" TEXT,
    "confidence" REAL,
    "source" TEXT,
    "method" TEXT NOT NULL DEFAULT 'AI',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttributeValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AttributeDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClauseLibraryEntry_key_key" ON "ClauseLibraryEntry"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Template_key_key" ON "Template"("key");

-- CreateIndex
CREATE INDEX "TemplateClause_templateId_idx" ON "TemplateClause"("templateId");

-- CreateIndex
CREATE INDEX "ContractClause_contractId_idx" ON "ContractClause"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_key_key" ON "AttributeDefinition"("key");

-- CreateIndex
CREATE INDEX "AttributeValue_documentId_idx" ON "AttributeValue"("documentId");

-- CreateIndex
CREATE INDEX "AttributeValue_contractId_idx" ON "AttributeValue"("contractId");

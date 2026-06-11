-- Procurement workflow: org branding, file templates, deals, compliance rules, review issues

CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "orgName" TEXT NOT NULL DEFAULT 'Your Organization',
    "logoStorageKey" TEXT,
    "headerText" TEXT,
    "footerText" TEXT,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FileTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "documentId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ORG_SELLING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ComplianceRulePack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "documentId" TEXT,
    "rulesText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ORG_SELLING',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "documentId" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_fileTemplateId_fkey" FOREIGN KEY ("fileTemplateId") REFERENCES "FileTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_rulePackId_fkey" FOREIGN KEY ("rulePackId") REFERENCES "ComplianceRulePack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Deal_vendorAccessToken_key" ON "Deal"("vendorAccessToken");
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

CREATE TABLE "ReviewIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "page" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "raisedBySide" TEXT NOT NULL DEFAULT 'ORG',
    "raisedById" TEXT,
    "vendorResponse" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewIssue_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReviewIssue_dealId_status_idx" ON "ReviewIssue"("dealId", "status");

INSERT INTO "OrganizationSettings" ("id", "orgName", "updatedAt") VALUES ('default', 'Your Organization', CURRENT_TIMESTAMP);

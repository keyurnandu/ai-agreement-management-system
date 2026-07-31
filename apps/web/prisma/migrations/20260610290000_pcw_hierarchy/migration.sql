-- PCW/SCW middle tier: Master → PCW → POR; amendments on Master or PCW
-- Per-direction compliance rule packs (direction column: migration 20260610300000)

-- Rename masters for clarity
UPDATE "CommercialRecordType" SET "name" = 'Master Contract (PMCW)', "description" = 'Highest-level procurement master per vendor/business' WHERE "id" = 'ctype_pmcw';
UPDATE "CommercialRecordType" SET "name" = 'Master Contract (SMCW)', "description" = 'Highest-level sales master per customer/business' WHERE "id" = 'ctype_smcw';
UPDATE "CommercialRecordType" SET "description" = 'Purchase order under a PCW' WHERE "id" = 'ctype_por';
UPDATE "CommercialRecordType" SET "description" = 'Sales order under an SCW' WHERE "id" = 'ctype_sor';

-- DEAL domain: PCW + SCW middle tiers
INSERT OR IGNORE INTO "CommercialRecordType" ("id", "key", "name", "prefix", "direction", "domain", "isRoot", "description", "system", "sortOrder", "active")
VALUES
  ('ctype_pcw', 'pcw', 'Purchase Contract Wrapper (PCW)', 'PCW', 'ORG_BUYING', 'DEAL', false, 'Framework contract under master — holds multiple PORs', true, 3, true),
  ('ctype_scw', 'scw', 'Sales Contract Wrapper (SCW)', 'SCW', 'ORG_SELLING', 'DEAL', false, 'Framework contract under master — holds multiple SORs', true, 3, true);

-- CONTRACT domain: CPCW + CSCW
INSERT OR IGNORE INTO "CommercialRecordType" ("id", "key", "name", "prefix", "direction", "domain", "isRoot", "description", "system", "sortOrder", "active")
VALUES
  ('ctype_cpcw', 'cpcw', 'Contract PCW', 'CPCW', 'ORG_BUYING', 'CONTRACT', false, 'Structured PCW under CPMCW', true, 12, true),
  ('ctype_cscw', 'cscw', 'Contract SCW', 'CSCW', 'ORG_SELLING', 'CONTRACT', false, 'Structured SCW under CSMCW', true, 12, true);

-- Amendment types (referenced by the links below). Created here so a cold
-- migration apply has valid FK targets; the seed also upserts these.
INSERT OR IGNORE INTO "CommercialRecordType" ("id", "key", "name", "prefix", "direction", "domain", "isRoot", "description", "system", "sortOrder", "active")
VALUES
  ('ctype_sam', 'sam', 'Sales Amendment', 'SAM', 'ORG_SELLING', 'DEAL', false, 'Amendment under a sales master or SCW', true, 5, true),
  ('ctype_pam', 'pam', 'Procurement Amendment', 'PAM', 'ORG_BUYING', 'DEAL', false, 'Amendment under a procurement master or PCW', true, 6, true),
  ('ctype_csam', 'csam', 'Contract Sales Amendment', 'CSAM', 'ORG_SELLING', 'CONTRACT', false, 'Structured sales amendment', true, 14, true),
  ('ctype_cpam', 'cpam', 'Contract Procurement Amendment', 'CPAM', 'ORG_BUYING', 'CONTRACT', false, 'Structured procurement amendment', true, 15, true);

-- Remove direct master → order links
DELETE FROM "CommercialTypeLink" WHERE "id" IN ('link_pmcw_por', 'link_smcw_sor', 'link_cpmcw_cpor', 'link_csmcw_csor');

-- New hierarchy links (DEAL)
INSERT OR IGNORE INTO "CommercialTypeLink" ("id", "parentTypeId", "childTypeId") VALUES
  ('link_pmcw_pcw', 'ctype_pmcw', 'ctype_pcw'),
  ('link_pcw_por', 'ctype_pcw', 'ctype_por'),
  ('link_pcw_pam', 'ctype_pcw', 'ctype_pam'),
  ('link_smcw_scw', 'ctype_smcw', 'ctype_scw'),
  ('link_scw_sor', 'ctype_scw', 'ctype_sor'),
  ('link_scw_sam', 'ctype_scw', 'ctype_sam');

-- New hierarchy links (CONTRACT)
INSERT OR IGNORE INTO "CommercialTypeLink" ("id", "parentTypeId", "childTypeId") VALUES
  ('link_cpmcw_cpcw', 'ctype_cpmcw', 'ctype_cpcw'),
  ('link_cpcw_cpor', 'ctype_cpcw', 'ctype_cpor'),
  ('link_cpcw_cpam', 'ctype_cpcw', 'ctype_cpam'),
  ('link_csmcw_cscw', 'ctype_csmcw', 'ctype_cscw'),
  ('link_cscw_csor', 'ctype_cscw', 'ctype_csor'),
  ('link_cscw_csam', 'ctype_cscw', 'ctype_csam');

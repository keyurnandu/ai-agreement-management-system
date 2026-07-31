import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUSE_LIBRARY, TEMPLATES, ATTRIBUTES, SHARED_VARS } from "./seed-data/commercial-clauses.mjs";
import { DEMO_GUIDE, PORTAL, SALES_TABLE_PRIMARY, SALES_TABLE_EXPANSION, PROC_TABLE_PRIMARY, portalUrl } from "./seed-data/demo-flows.mjs";
import {
  SALES_CHECKS_TITLE,
  SALES_CHECKS_LINES,
  SALES_CHECKS_TEXT,
  PROCUREMENT_CHECKS_TITLE,
  PROCUREMENT_CHECKS_LINES,
  PROCUREMENT_CHECKS_TEXT,
} from "./seed-data/sample-compliance-checks.mjs";
import {
  SALES_TEMPLATE_NAME,
  SALES_TEMPLATE_DESCRIPTION,
  SALES_TEMPLATE_TITLE,
  SALES_TEMPLATE_LINES,
} from "./seed-data/sample-sales-template.mjs";
import { SignJWT } from "jose";
import { enrichDemoAttributes } from "./enrich-demo-attributes.mjs";

const prisma = new PrismaClient();
const __dir = dirname(fileURLToPath(import.meta.url));

const USERS = [
  { email: "admin@local.test", name: "Local Admin", role: "ADMIN", password: "Admin123!" },
  { email: "manager@local.test", name: "Sales & Procurement Manager", role: "MANAGER", password: "Manager123!" },
  { email: "viewer@local.test", name: "Viewer", role: "VIEWER", password: "Viewer123!" },
];

/** Valid blank single-page PDF (renders in the PDF engine). */
const MIN_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF`,
  "utf8",
);

function findRepoRoot(start = __dir) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8"));
        if (json.name === "contract-platform") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(__dir, "../..");
}

/** Match apps/web/src/env.ts resolveLocalPath — seed cwd is apps/web. */
function resolveLocalPath(p) {
  const root = findRepoRoot();
  return isAbsolute(p) ? p : join(root, p.replace(/^\.\//, ""));
}

function storageRoot() {
  return resolveLocalPath(process.env.STORAGE_LOCAL_ROOT ?? "./data/files");
}

function substitute(body, vars) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
}

function documentStorageKey(documentId, version) {
  return `documents/${documentId}/v${version}.pdf`;
}

function normalizeClauseText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CONTRACT_DOCUMENT_CSS = `
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #1a1a1a; margin: 0; }
.doc-title { font-size: 18pt; font-weight: 700; margin: 0 0 18pt 0; color: #111111; }
.clause { margin: 0 0 16pt 0; }
.clause-title { font-size: 11pt; font-weight: 700; margin: 0 0 6pt 0; color: #111111; }
.clause-body { font-size: 11pt; font-weight: 400; margin: 0; white-space: pre-wrap; }
`;

function composeContractHtml(title, clauses) {
  const sections = [...clauses]
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const clauseTitle = escapeHtml(normalizeClauseText(c.title));
      const body = escapeHtml(normalizeClauseText(c.body));
      return `<section class="clause"><div class="clause-title">${c.order}. ${clauseTitle}</div><div class="clause-body">${body}</div></section>`;
    })
    .join("\n");
  return `<html><body><h1 class="doc-title">${escapeHtml(normalizeClauseText(title))}</h1>${sections}</body></html>`;
}

async function serviceToken(scope) {
  const secret = new TextEncoder().encode(process.env.SERVICE_JWT_SECRET ?? "dev-shared-service-secret-change-me");
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("seed")
    .setIssuer("contract-platform-web")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secret);
}

async function renderTextPagePdf(title, lines) {
  const base = process.env.PDF_ENGINE_URL ?? "http://localhost:8001";
  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (!h.ok) return null;
    const token = await serviceToken("pdf.textpage");
    const res = await fetch(`${base}/pdf/text-page`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, lines }),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeSamplePdfFile(filename, bytes) {
  if (!bytes || bytes.byteLength <= MIN_PDF.byteLength + 20) return;
  const dir = join(__dir, "seed-data/files");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
}

/** Create or refresh a demo PDF document with a fixed id. */
async function ensurePdfDocument({ docId, title, ownerId, note, filename, pageTitle, lines }) {
  let bytes = await renderTextPagePdf(pageTitle, lines);
  if (bytes) await writeSamplePdfFile(filename, bytes);
  else bytes = MIN_PDF;

  let doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) {
    doc = await prisma.document.create({ data: { id: docId, title, ownerId, kind: "FILE" } });
    const key = documentStorageKey(doc.id, 1);
    await putPdf(key, bytes);
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storageKey: key,
        byteSize: bytes.byteLength,
        pageCount: bytes === MIN_PDF ? 1 : undefined,
        originalFilename: filename,
        createdById: ownerId,
        note,
      },
    });
    return doc.id;
  }

  await prisma.document.update({ where: { id: docId }, data: { title } });
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId: docId },
    orderBy: { version: "desc" },
  });
  if (latest?.note === note && latest.byteSize > MIN_PDF.byteLength) return doc.id;

  await appendDocumentVersion(docId, bytes, title, ownerId, note, bytes === MIN_PDF ? 1 : undefined);
  return doc.id;
}

async function renderContractDocumentPdf(html) {
  const base = process.env.PDF_ENGINE_URL ?? "http://localhost:8001";
  const token = await serviceToken("pdf.contract");
  const res = await fetch(`${base}/pdf/contract-document`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ html, css: CONTRACT_DOCUMENT_CSS.trim() }),
  });
  if (!res.ok) throw new Error(await res.text());
  return {
    pdf: Buffer.from(await res.arrayBuffer()),
    pages: Number(res.headers.get("X-Page-Count") ?? 1),
  };
}

async function appendDocumentVersion(documentId, pdf, title, ownerId, note, pageCount = 1) {
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;
  const key = documentStorageKey(documentId, version);
  await putPdf(key, pdf);
  await prisma.documentVersion.create({
    data: {
      documentId,
      version,
      storageKey: key,
      byteSize: pdf.byteLength,
      pageCount,
      originalFilename: `${title.replace(/[^\w.-]+/g, "_")}.pdf`,
      createdById: ownerId,
      note,
    },
  });
  await prisma.document.update({ where: { id: documentId }, data: { title } });
}

/** Render linked contract clauses into deal PDFs (replaces empty demo shells). */
async function backfillDemoContractPdfs() {
  const base = process.env.PDF_ENGINE_URL ?? "http://localhost:8001";
  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (!h.ok) {
      console.log("  - PDF engine offline, skipping contract PDF generation");
      return;
    }
  } catch {
    console.log("  - PDF engine offline, skipping contract PDF generation");
    return;
  }

  const deals = await prisma.deal.findMany({
    where: { contractId: { not: null } },
    select: { id: true, documentId: true, contractId: true, ownerId: true, commercialId: true },
  });
  let generated = 0;
  for (const deal of deals) {
    const contract = await prisma.contract.findUnique({
      where: { id: deal.contractId },
      include: { clauses: { orderBy: { order: "asc" } } },
    });
    if (!contract?.clauses.length) continue;

    const latest = await prisma.documentVersion.findFirst({
      where: { documentId: deal.documentId },
      orderBy: { version: "desc" },
    });
    if (latest?.note === "generated from demo contract") continue;

    try {
      const html = composeContractHtml(contract.title, contract.clauses);
      const { pdf, pages } = await renderContractDocumentPdf(html);
      await appendDocumentVersion(
        deal.documentId,
        pdf,
        contract.title,
        deal.ownerId,
        "generated from demo contract",
        pages,
      );
      await prisma.contract.update({
        where: { id: contract.id },
        data: { documentId: deal.documentId, status: "GENERATED" },
      });
      generated++;
    } catch (e) {
      console.log(`  - skipped ${deal.commercialId ?? deal.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (generated) console.log(`  - generated ${generated} demo contract PDF(s)`);
}

async function putPdf(key, bytes) {
  const path = join(storageRoot(), key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

/** Ensure PDF bytes exist where the web app reads them (fixes legacy seed paths). */
async function repairDocumentFiles() {
  const versions = await prisma.documentVersion.findMany({ select: { storageKey: true } });
  const root = storageRoot();
  const legacyRoots = [
    join(__dir, "..", "data", "files"),
    join(__dir, "..", "storage"),
  ];
  let repaired = 0;
  for (const { storageKey } of versions) {
    const target = join(root, storageKey);
    if (existsSync(target) && statSync(target).size >= 150) continue;
    if (existsSync(target)) {
      await putPdf(storageKey, MIN_PDF);
      repaired++;
      continue;
    }
    let copied = false;
    for (const legacy of legacyRoots) {
      const legacyPath = join(legacy, storageKey);
      if (existsSync(legacyPath)) {
        await mkdir(dirname(target), { recursive: true });
        await copyFile(legacyPath, target);
        copied = true;
        repaired++;
        break;
      }
    }
    if (!copied) {
      await putPdf(storageKey, MIN_PDF);
      repaired++;
    }
  }
  if (repaired) console.log(`  - repaired ${repaired} document file(s) under ${root}`);
}

/** Normalize spacing in existing contract clause rows. */
async function normalizeExistingClauses() {
  const clauses = await prisma.contractClause.findMany({ select: { id: true, title: true, body: true } });
  let updated = 0;
  for (const c of clauses) {
    const title = normalizeClauseText(c.title);
    const body = normalizeClauseText(c.body);
    if (title !== c.title || body !== c.body) {
      await prisma.contractClause.update({ where: { id: c.id }, data: { title, body } });
      updated++;
    }
  }
  if (updated) console.log(`  - normalized ${updated} contract clause(s)`);
}

async function createPlaceholderDocument(title, ownerId, note) {
  const doc = await prisma.document.create({ data: { title, ownerId, kind: "FILE" } });
  const key = documentStorageKey(doc.id, 1);
  await putPdf(key, MIN_PDF);
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storageKey: key,
      byteSize: MIN_PDF.byteLength,
      pageCount: 1,
      originalFilename: `${title.replace(/[^\w.-]+/g, "_")}.pdf`,
      createdById: ownerId,
      note,
    },
  });
  return doc.id;
}

async function seedPcwHierarchy() {
  const middleTypes = [
    { id: "ctype_pcw", key: "pcw", name: "Purchase Contract Wrapper (PCW)", prefix: "PCW", direction: "ORG_BUYING", domain: "DEAL", isRoot: false, sortOrder: 3 },
    { id: "ctype_scw", key: "scw", name: "Sales Contract Wrapper (SCW)", prefix: "SCW", direction: "ORG_SELLING", domain: "DEAL", isRoot: false, sortOrder: 3 },
    { id: "ctype_cpcw", key: "cpcw", name: "Contract PCW", prefix: "CPCW", direction: "ORG_BUYING", domain: "CONTRACT", isRoot: false, sortOrder: 12 },
    { id: "ctype_cscw", key: "cscw", name: "Contract SCW", prefix: "CSCW", direction: "ORG_SELLING", domain: "CONTRACT", isRoot: false, sortOrder: 12 },
  ];
  for (const t of middleTypes) {
    await prisma.commercialRecordType.upsert({
      where: { id: t.id },
      update: { ...t, system: true, active: true },
      create: { ...t, system: true, active: true, description: `${t.name} under master` },
    });
    await prisma.commercialIdSequence.upsert({ where: { prefix: t.prefix }, update: {}, create: { prefix: t.prefix, nextVal: 1 } });
  }
  await seedAmendmentTypes();
  const extraLinks = [
    { id: "link_pmcw_pcw", parentTypeId: "ctype_pmcw", childTypeId: "ctype_pcw" },
    { id: "link_pcw_por", parentTypeId: "ctype_pcw", childTypeId: "ctype_por" },
    { id: "link_pcw_pam", parentTypeId: "ctype_pcw", childTypeId: "ctype_pam" },
    { id: "link_smcw_scw", parentTypeId: "ctype_smcw", childTypeId: "ctype_scw" },
    { id: "link_scw_sor", parentTypeId: "ctype_scw", childTypeId: "ctype_sor" },
    { id: "link_scw_sam", parentTypeId: "ctype_scw", childTypeId: "ctype_sam" },
    { id: "link_cpmcw_cpcw", parentTypeId: "ctype_cpmcw", childTypeId: "ctype_cpcw" },
    { id: "link_cpcw_cpor", parentTypeId: "ctype_cpcw", childTypeId: "ctype_cpor" },
    { id: "link_cpcw_cpam", parentTypeId: "ctype_cpcw", childTypeId: "ctype_cpam" },
    { id: "link_csmcw_cscw", parentTypeId: "ctype_csmcw", childTypeId: "ctype_cscw" },
    { id: "link_cscw_csor", parentTypeId: "ctype_cscw", childTypeId: "ctype_csor" },
    { id: "link_cscw_csam", parentTypeId: "ctype_cscw", childTypeId: "ctype_csam" },
  ];
  for (const l of extraLinks) {
    await prisma.commercialTypeLink.upsert({ where: { id: l.id }, update: l, create: l });
  }
  await prisma.commercialTypeLink.deleteMany({
    where: { id: { in: ["link_pmcw_por", "link_smcw_sor", "link_cpmcw_cpor", "link_csmcw_csor"] } },
  });
}

async function seedCompliancePacks(userId) {
  console.log("Seeding sample compliance check files:");
  const salesDocId = await ensurePdfDocument({
    docId: "doc_sample_checks_sales",
    title: SALES_CHECKS_TITLE,
    ownerId: userId,
    note: "sample compliance checks — sales",
    filename: "sample-compliance-checks-sales.pdf",
    pageTitle: SALES_CHECKS_TITLE,
    lines: SALES_CHECKS_LINES,
  });
  const procDocId = await ensurePdfDocument({
    docId: "doc_sample_checks_procurement",
    title: PROCUREMENT_CHECKS_TITLE,
    ownerId: userId,
    note: "sample compliance checks — procurement",
    filename: "sample-compliance-checks-procurement.pdf",
    pageTitle: PROCUREMENT_CHECKS_TITLE,
    lines: PROCUREMENT_CHECKS_LINES,
  });

  const packs = [
    {
      id: "pack_adobe_procurement",
      name: "Adobe — Procurement compliance rules",
      direction: "ORG_BUYING",
      rulesText: PROCUREMENT_CHECKS_TEXT,
      documentId: procDocId,
    },
    {
      id: "pack_adobe_sales",
      name: "Adobe — Sales compliance rules",
      direction: "ORG_SELLING",
      rulesText: SALES_CHECKS_TEXT,
      documentId: salesDocId,
    },
  ];
  for (const p of packs) {
    await prisma.complianceRulePack.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        direction: p.direction,
        rulesText: p.rulesText,
        documentId: p.documentId,
        active: true,
      },
      create: { ...p, active: true, createdById: userId },
    });
  }
  console.log("  - Settings → Compliance rules (sales + procurement PDFs)");
  console.log("  - Text sources: scripts/seed-data/files/sample-compliance-checks-*.txt");
}

async function seedFileTemplates(userId) {
  console.log("Seeding sample deal file templates:");
  const docId = await ensurePdfDocument({
    docId: "doc_sample_sales_template",
    title: SALES_TEMPLATE_TITLE,
    ownerId: userId,
    note: "sample sales order template",
    filename: "sample-sales-order-template.pdf",
    pageTitle: SALES_TEMPLATE_TITLE,
    lines: SALES_TEMPLATE_LINES,
  });

  await prisma.fileTemplate.upsert({
    where: { id: "ftpl_sample_sales_order" },
    update: {
      name: SALES_TEMPLATE_NAME,
      description: SALES_TEMPLATE_DESCRIPTION,
      documentId: docId,
      direction: "ORG_SELLING",
      active: true,
    },
    create: {
      id: "ftpl_sample_sales_order",
      name: SALES_TEMPLATE_NAME,
      description: SALES_TEMPLATE_DESCRIPTION,
      documentId: docId,
      direction: "ORG_SELLING",
      active: true,
      createdById: userId,
    },
  });
  console.log("  - Settings → Deal templates → Sample Sales Order Form");
  console.log("  - Text source: scripts/seed-data/files/sample-sales-order-template.txt");
}

async function seedAmendmentTypes() {
  const types = [
    { id: "ctype_sam", key: "sam", name: "Sales Amendment", prefix: "SAM", direction: "ORG_SELLING", domain: "DEAL", isRoot: false, sortOrder: 5 },
    { id: "ctype_pam", key: "pam", name: "Procurement Amendment", prefix: "PAM", direction: "ORG_BUYING", domain: "DEAL", isRoot: false, sortOrder: 6 },
    { id: "ctype_csam", key: "csam", name: "Contract Sales Amendment", prefix: "CSAM", direction: "ORG_SELLING", domain: "CONTRACT", isRoot: false, sortOrder: 14 },
    { id: "ctype_cpam", key: "cpam", name: "Contract Procurement Amendment", prefix: "CPAM", direction: "ORG_BUYING", domain: "CONTRACT", isRoot: false, sortOrder: 15 },
  ];
  for (const t of types) {
    await prisma.commercialRecordType.upsert({
      where: { id: t.id },
      update: { ...t, system: true, active: true, description: `${t.name} under master` },
      create: { ...t, system: true, active: true, description: `${t.name} under master` },
    });
    await prisma.commercialIdSequence.upsert({
      where: { prefix: t.prefix },
      update: {},
      create: { prefix: t.prefix, nextVal: 1 },
    });
  }
  const links = [
    { id: "link_smcw_sam", parentTypeId: "ctype_smcw", childTypeId: "ctype_sam" },
    { id: "link_pmcw_pam", parentTypeId: "ctype_pmcw", childTypeId: "ctype_pam" },
    { id: "link_csmcw_csam", parentTypeId: "ctype_csmcw", childTypeId: "ctype_csam" },
    { id: "link_cpmcw_cpam", parentTypeId: "ctype_cpmcw", childTypeId: "ctype_cpam" },
  ];
  for (const l of links) {
    await prisma.commercialTypeLink.upsert({
      where: { id: l.id },
      update: l,
      create: l,
    });
  }
}

async function seedAuthoring() {
  console.log("Seeding commercial clause library + templates:");
  await prisma.template.updateMany({ where: { key: "mutual-nda" }, data: { active: false } });

  const idByKey = {};
  for (const c of CLAUSE_LIBRARY) {
    const row = await prisma.clauseLibraryEntry.upsert({
      where: { key: c.key },
      update: { title: c.title, category: c.category ?? null, body: normalizeClauseText(c.body), fallbacks: c.fallbacks ?? undefined, active: true },
      create: { key: c.key, title: c.title, category: c.category ?? null, body: normalizeClauseText(c.body), fallbacks: c.fallbacks ?? undefined },
    });
    idByKey[c.key] = row.id;
  }

  for (const tpl of TEMPLATES) {
    const row = await prisma.template.upsert({
      where: { key: tpl.key },
      update: { name: tpl.name, description: tpl.description, variables: tpl.variables, active: true },
      create: { key: tpl.key, name: tpl.name, description: tpl.description, variables: tpl.variables },
    });
    await prisma.templateClause.deleteMany({ where: { templateId: row.id } });
    await prisma.templateClause.createMany({
      data: tpl.clauseOrder.map((k, i) => ({ templateId: row.id, clauseId: idByKey[k], order: i + 1, required: true })),
    });
  }

  for (const a of ATTRIBUTES) {
    await prisma.attributeDefinition.upsert({
      where: { key: a.key },
      update: { label: a.label, group: a.group, type: a.type, mode: a.mode, prompt: a.prompt, scope: a.scope, active: true },
      create: { key: a.key, label: a.label, group: a.group, type: a.type, mode: a.mode, prompt: a.prompt, scope: a.scope },
    });
  }

  await prisma.organizationSettings.upsert({
    where: { id: "default" },
    update: { orgName: SHARED_VARS.provider },
    create: { id: "default", orgName: SHARED_VARS.provider, headerText: SHARED_VARS.provider },
  });

  console.log(`  - ${CLAUSE_LIBRARY.length} clauses, ${TEMPLATES.length} templates, ${ATTRIBUTES.length} attributes`);
}

async function reserveId(prefix, n) {
  await prisma.commercialIdSequence.upsert({
    where: { prefix },
    update: { nextVal: n + 1 },
    create: { prefix, nextVal: n + 1 },
  });
  return `${prefix}-${n}`;
}

async function createContractFromTemplate({ tplKey, typeId, commercialId, prefix, reserveNum, title, parentId, vars, userId }) {
  if (commercialId) {
    const existing = await prisma.contract.findFirst({ where: { commercialId } });
    if (existing) return existing;
  } else {
    const guess = `${prefix}-${reserveNum ?? 1}`;
    const existing = await prisma.contract.findFirst({ where: { commercialId: guess } });
    if (existing) return existing;
  }

  const tpl = await prisma.template.findUnique({
    where: { key: tplKey },
    include: { clauses: { include: { clause: true }, orderBy: { order: "asc" } } },
  });
  if (!tpl) throw new Error(`template ${tplKey} missing`);

  const id = commercialId ?? (await reserveId(prefix, reserveNum ?? 1));
  const contract = await prisma.contract.create({
    data: {
      commercialId: id,
      commercialTypeId: typeId,
      parentContractId: parentId,
      title,
      templateId: tpl.id,
      variables: vars,
      createdById: userId,
      status: "DRAFT",
    },
  });
  await prisma.contractClause.createMany({
    data: tpl.clauses.map((tc, i) => ({
      contractId: contract.id,
      order: i + 1,
      title: normalizeClauseText(tc.clause.title),
      body: normalizeClauseText(substitute(tc.clause.body, vars)),
      sourceClauseId: tc.clause.id,
    })),
  });
  return contract;
}

async function ensureDealDocument(commercialId, title, ownerId, note) {
  const existingDeal = await prisma.deal.findFirst({
    where: { commercialId },
    select: { documentId: true },
  });
  if (existingDeal?.documentId) {
    const doc = await prisma.document.findUnique({ where: { id: existingDeal.documentId } });
    if (doc) {
      await prisma.document.update({ where: { id: doc.id }, data: { title } });
      return doc.id;
    }
  }
  return createPlaceholderDocument(title, ownerId, note);
}

async function ensureDeal({
  commercialId,
  commercialTypeId,
  recordType,
  title,
  direction,
  status,
  documentId,
  contractId,
  ownerId,
  vendorEmail,
  vendorName,
  vendorAccessToken,
  parentDealId,
  sentToVendorAt,
  rulePackId,
  fileTemplateId,
}) {
  const data = {
    commercialId,
    commercialTypeId,
    recordType,
    title,
    direction,
    status,
    documentId,
    contractId: contractId ?? null,
    ownerId,
    vendorEmail,
    vendorName,
    vendorAccessToken,
    parentDealId: parentDealId ?? null,
    sentToVendorAt: sentToVendorAt ?? null,
    rulePackId: rulePackId ?? null,
    fileTemplateId: fileTemplateId ?? null,
  };
  const existing = await prisma.deal.findFirst({ where: { commercialId } });
  if (existing) {
    return prisma.deal.update({ where: { id: existing.id }, data });
  }
  return prisma.deal.create({ data });
}

async function linkDealContract(deal, contract) {
  await prisma.deal.update({
    where: { id: deal.id },
    data: { contractId: contract.id, commercialId: deal.commercialId },
  });
  await prisma.contract.update({
    where: { id: contract.id },
    data: { dealId: deal.id, commercialId: deal.commercialId },
  });
}

async function ensureReviewIssues(dealId, issues) {
  for (const issue of issues) {
    const existing = await prisma.reviewIssue.findFirst({
      where: { dealId, title: issue.title },
    });
    if (existing) {
      await prisma.reviewIssue.update({
        where: { id: existing.id },
        data: { ...issue, dealId },
      });
    } else {
      await prisma.reviewIssue.create({ data: { ...issue, dealId } });
    }
  }
}

function printDemoFlowGuide() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  DEMO FLOWS — Sales & Procurement sample contracts");
  console.log("  Login: manager@local.test / Manager123!  (admin for bulk delete)");
  console.log("══════════════════════════════════════════════════════════════\n");
  for (const row of DEMO_GUIDE) {
    console.log(`▸ ${row.flow}`);
    console.log(`  Deal: ${row.deal} (${row.status})${row.path ? ` · ${row.path}` : ""}`);
    console.log(`  Try: ${row.try}`);
    if (row.portal) console.log(`  Portal: ${portalUrl(row.portal)}`);
    console.log("");
  }
  console.log("Contracts list: /contracts/sales · /contracts/procurement");
  console.log("Re-run: cd apps/web && npm run db:seed\n");
}

/** Realistic vendor SaaS "paper" — intentionally has some required terms and
 *  omits others, so the Adobe procurement compliance check flags real gaps. */
function vendorPaperLines(vendor) {
  return [
    `This Master Subscription Agreement ("Agreement") is entered into between ${vendor} ("Provider") and Adobe Inc. ("Customer").`,
    "",
    "1. SERVICES. Provider will make its cloud software available to Customer on a subscription basis during the Term.",
    "2. FEES & PAYMENT. Customer shall pay all undisputed fees within forty-five (45) days of the invoice date.",
    "3. TERM & RENEWAL. This Agreement begins on the Effective Date and will automatically renew for successive twelve (12) month periods unless either party gives ninety (90) days written non-renewal notice.",
    "4. LIMITATION OF LIABILITY. Provider's aggregate liability shall not exceed the fees paid by Customer in the one (1) month preceding the event giving rise to the claim.",
    "5. CONFIDENTIALITY. Each party shall protect the other's Confidential Information using at least reasonable care.",
    "6. GOVERNING LAW. This Agreement is governed by the laws of the State of California, without regard to conflicts of law.",
    "7. WARRANTIES. The services are provided \"AS IS\" without warranty of any kind, express or implied.",
    "8. TERMINATION. Either party may terminate this Agreement for material breach not cured within thirty (30) days after written notice.",
  ];
}

async function seedDemo(userId) {
  console.log("Seeding sales & procurement demo flows (upsert):");

  const salesVars = {
    ...SHARED_VARS,
    customer: "Microsoft Corporation",
    customer_address: "One Microsoft Way, Redmond, WA 98052",
    effective_date: "2026-01-15",
    master_reference: "Master Customer Agreement dated January 15, 2026",
  };
  const salesOrderVars = {
    ...salesVars,
    services_description: SALES_TABLE_PRIMARY,
    order_total: "$360,000 USD",
    billing_frequency: "Annual in advance",
    subscription_term: "12 months",
    renewal_notice_days: "60",
    renewal_period: "12-month",
    support_tier: "Enterprise — 99.9% SLA",
    special_terms: "Includes priority model access and dedicated CSM.",
  };
  const salesOrderVars2 = {
    ...salesOrderVars,
    services_description: SALES_TABLE_EXPANSION,
    order_total: "$486,000 USD",
    special_terms: "Seat expansion per Amendment 1 — pricing holds through renewal.",
  };
  const salesAmendVars = {
    ...salesVars,
    amendment_number: "1",
    amendment_date: "2026-03-01",
    amended_provisions:
      "Section 3 (Services): seat count increased from 500 to 750.\nSection 4 (Fees): revised annual fee to $486,000 USD effective April 1, 2026.",
  };

  const procVars = {
    ...SHARED_VARS,
    provider: "Anthropic Technologies, LLC",
    provider_address: "548 Market Street, PMB 90375, San Francisco, CA 94104",
    customer: "Adobe Inc.",
    customer_address: SHARED_VARS.provider_address,
    effective_date: "2026-02-01",
    master_reference: "Master Vendor Agreement dated February 1, 2026",
  };
  const procOrderVars = {
    ...procVars,
    services_description: PROC_TABLE_PRIMARY,
    order_total: "$120,000 USD",
    billing_frequency: "Quarterly in advance",
    subscription_term: "12 months",
    renewal_notice_days: "30",
    renewal_period: "12-month",
    support_tier: "Standard API support",
    special_terms: "Usage above commitment billed at published overage rates.",
  };

  // ── Contracts (clause library) ──
  const csmcw = await createContractFromTemplate({
    tplKey: "sales-master-agreement",
    typeId: "ctype_csmcw",
    commercialId: "SMCW-1",
    prefix: "SMCW",
    title: "Master Customer Agreement — Microsoft",
    parentId: null,
    vars: salesVars,
    userId,
  });
  const cscw = await createContractFromTemplate({
    tplKey: "sales-master-agreement",
    typeId: "ctype_cscw",
    commercialId: "SCW-1",
    prefix: "SCW",
    title: "Framework Customer Contract — Microsoft 2026",
    parentId: csmcw.id,
    vars: salesVars,
    userId,
  });
  const csor = await createContractFromTemplate({
    tplKey: "sales-order-form",
    typeId: "ctype_csor",
    commercialId: "SOR-1",
    prefix: "SOR",
    title: "Order Form Q1 2026 — Microsoft Enterprise",
    parentId: cscw.id,
    vars: salesOrderVars,
    userId,
  });
  const csor2 = await createContractFromTemplate({
    tplKey: "sales-order-form",
    typeId: "ctype_csor",
    commercialId: "SOR-2",
    prefix: "SOR",
    reserveNum: 2,
    title: "Order Form Q2 2026 — Microsoft seat expansion",
    parentId: cscw.id,
    vars: salesOrderVars2,
    userId,
  });
  const csam = await createContractFromTemplate({
    tplKey: "sales-amendment",
    typeId: "ctype_csam",
    commercialId: "SAM-1",
    prefix: "SAM",
    title: "Amendment 1 — Seat expansion",
    parentId: csmcw.id,
    vars: salesAmendVars,
    userId,
  });

  const cpmcw = await createContractFromTemplate({
    tplKey: "procurement-master-agreement",
    typeId: "ctype_cpmcw",
    commercialId: "PMCW-1",
    prefix: "PMCW",
    title: "Master Vendor Agreement — Anthropic",
    parentId: null,
    vars: procVars,
    userId,
  });
  const cpcw = await createContractFromTemplate({
    tplKey: "procurement-master-agreement",
    typeId: "ctype_cpcw",
    commercialId: "PCW-1",
    prefix: "PCW",
    title: "Framework Purchase Contract — Anthropic 2026",
    parentId: cpmcw.id,
    vars: procVars,
    userId,
  });
  const cpor = await createContractFromTemplate({
    tplKey: "procurement-order-form",
    typeId: "ctype_cpor",
    commercialId: "POR-1",
    prefix: "POR",
    title: "PO-2026-001 — API token allocation",
    parentId: cpcw.id,
    vars: procOrderVars,
    userId,
  });

  // ── Documents (one per deal for distinct PDFs) ──
  const docSmcw = await ensureDealDocument("SMCW-1", "SMCW-1 — Microsoft Master Agreement", userId, "Sales demo — master");
  const docScw = await ensureDealDocument("SCW-1", "SCW-1 — Microsoft Framework 2026", userId, "Sales demo — wrapper");
  const docSor1 = await ensureDealDocument("SOR-1", "SOR-1 — Microsoft Enterprise Order Q1", userId, "Sales demo — order table");
  const docSor2 = await ensureDealDocument("SOR-2", "SOR-2 — Microsoft seat expansion Q2", userId, "Sales demo — sent to customer");
  const docSam1 = await ensureDealDocument("SAM-1", "SAM-1 — Microsoft Amendment 1", userId, "Sales demo — amendment");
  const docPmcw = await ensureDealDocument("PMCW-1", "PMCW-1 — Anthropic Master Vendor Agreement", userId, "Procurement demo — master");
  const docPcw = await ensureDealDocument("PCW-1", "PCW-1 — Anthropic Framework 2026", userId, "Procurement demo — wrapper");
  const docPor1 = await ensureDealDocument("POR-1", "POR-1 — Anthropic API PO 2026-001", userId, "Procurement demo — order table");
  const docPor2 = await ensureDealDocument("POR-2", "POR-2 — Figma tail spend (vendor paper)", userId, "Procurement demo — vendor upload");
  const docPor3 = await ensureDealDocument("POR-3", "POR-3 — Slack renewal (vendor submitted)", userId, "Procurement demo — under review");
  const docPor4 = await ensureDealDocument("POR-4", "POR-4 — Datadog (issues open)", userId, "Procurement demo — negotiation");

  // ── Sales deals ──
  const smcwDeal = await ensureDeal({
    commercialId: "SMCW-1",
    commercialTypeId: "ctype_smcw",
    recordType: "MASTER_CONTRACT",
    title: "Microsoft — Master Customer Agreement",
    direction: "ORG_SELLING",
    status: "UNDER_REVIEW",
    documentId: docSmcw,
    contractId: csmcw.id,
    ownerId: userId,
    vendorEmail: "legal@acme-industries.example",
    vendorName: "Microsoft Corporation",
    vendorAccessToken: PORTAL.smcw1,
    rulePackId: "pack_adobe_sales",
  });
  await linkDealContract(smcwDeal, csmcw);

  const scwDeal = await ensureDeal({
    commercialId: "SCW-1",
    commercialTypeId: "ctype_scw",
    recordType: "MASTER_CONTRACT",
    parentDealId: smcwDeal.id,
    title: "Microsoft — Framework Customer Contract 2026",
    direction: "ORG_SELLING",
    status: "DRAFT",
    documentId: docScw,
    contractId: cscw.id,
    ownerId: userId,
    vendorEmail: "legal@acme-industries.example",
    vendorName: "Microsoft Corporation",
    vendorAccessToken: PORTAL.scw1,
  });
  await linkDealContract(scwDeal, cscw);

  const sorDeal = await ensureDeal({
    commercialId: "SOR-1",
    commercialTypeId: "ctype_sor",
    recordType: "ORDER_FORM",
    parentDealId: scwDeal.id,
    title: "Microsoft — Enterprise Order Q1 2026 (product table)",
    direction: "ORG_SELLING",
    status: "DRAFT",
    documentId: docSor1,
    contractId: csor.id,
    ownerId: userId,
    vendorEmail: "legal@acme-industries.example",
    vendorName: "Microsoft Corporation",
    vendorAccessToken: PORTAL.sor1,
    fileTemplateId: "ftpl_sample_sales_order",
    rulePackId: "pack_adobe_sales",
  });
  await linkDealContract(sorDeal, csor);

  const sorDeal2 = await ensureDeal({
    commercialId: "SOR-2",
    commercialTypeId: "ctype_sor",
    recordType: "ORDER_FORM",
    parentDealId: scwDeal.id,
    title: "Microsoft — Seat expansion Q2 2026 (sent to customer)",
    direction: "ORG_SELLING",
    status: "WITH_VENDOR",
    documentId: docSor2,
    contractId: csor2.id,
    ownerId: userId,
    vendorEmail: "legal@acme-industries.example",
    vendorName: "Microsoft Corporation",
    vendorAccessToken: PORTAL.sor2,
    sentToVendorAt: new Date("2026-03-15T10:00:00Z"),
  });
  await linkDealContract(sorDeal2, csor2);

  const samDeal = await ensureDeal({
    commercialId: "SAM-1",
    commercialTypeId: "ctype_sam",
    recordType: "AMENDMENT",
    parentDealId: smcwDeal.id,
    title: "Microsoft — Amendment 1 (seat expansion)",
    direction: "ORG_SELLING",
    status: "DRAFT",
    documentId: docSam1,
    contractId: csam.id,
    ownerId: userId,
    vendorEmail: "legal@acme-industries.example",
    vendorName: "Microsoft Corporation",
    vendorAccessToken: PORTAL.sam1,
  });
  await linkDealContract(samDeal, csam);

  // ── Procurement deals ──
  const pmcwDeal = await ensureDeal({
    commercialId: "PMCW-1",
    commercialTypeId: "ctype_pmcw",
    recordType: "MASTER_CONTRACT",
    title: "Anthropic — Master Vendor Agreement",
    direction: "ORG_BUYING",
    status: "DRAFT",
    documentId: docPmcw,
    contractId: cpmcw.id,
    ownerId: userId,
    vendorEmail: "contracts@anthropic.example",
    vendorName: "Anthropic Technologies, LLC",
    vendorAccessToken: PORTAL.pmcw1,
    rulePackId: "pack_adobe_procurement",
  });
  await linkDealContract(pmcwDeal, cpmcw);

  const pcwDeal = await ensureDeal({
    commercialId: "PCW-1",
    commercialTypeId: "ctype_pcw",
    recordType: "MASTER_CONTRACT",
    parentDealId: pmcwDeal.id,
    title: "Anthropic — Framework Purchase Contract 2026",
    direction: "ORG_BUYING",
    status: "DRAFT",
    documentId: docPcw,
    contractId: cpcw.id,
    ownerId: userId,
    vendorEmail: "contracts@anthropic.example",
    vendorName: "Anthropic Technologies, LLC",
    vendorAccessToken: PORTAL.pcw1,
  });
  await linkDealContract(pcwDeal, cpcw);

  const porDeal = await ensureDeal({
    commercialId: "POR-1",
    commercialTypeId: "ctype_por",
    recordType: "ORDER_FORM",
    parentDealId: pcwDeal.id,
    title: "Anthropic API — PO 2026-001 (line items)",
    direction: "ORG_BUYING",
    status: "DRAFT",
    documentId: docPor1,
    contractId: cpor.id,
    ownerId: userId,
    vendorEmail: "contracts@anthropic.example",
    vendorName: "Anthropic Technologies, LLC",
    vendorAccessToken: PORTAL.por1,
  });
  await linkDealContract(porDeal, cpor);

  const porDeal2 = await ensureDeal({
    commercialId: "POR-2",
    commercialTypeId: "ctype_por",
    recordType: "ORDER_FORM",
    title: "Figma — Tail spend SaaS (vendor paper, no contract)",
    direction: "ORG_BUYING",
    status: "WITH_VENDOR",
    documentId: docPor2,
    contractId: null,
    ownerId: userId,
    vendorEmail: "legal@figma.example",
    vendorName: "Figma, Inc.",
    vendorAccessToken: PORTAL.por2,
    sentToVendorAt: new Date("2026-04-01T09:00:00Z"),
  });

  const porDeal3 = await ensureDeal({
    commercialId: "POR-3",
    commercialTypeId: "ctype_por",
    recordType: "ORDER_FORM",
    title: "Slack — Renewal (vendor submitted, awaiting review)",
    direction: "ORG_BUYING",
    status: "VENDOR_SUBMITTED",
    documentId: docPor3,
    contractId: null,
    ownerId: userId,
    vendorEmail: "contracts@slack.example",
    vendorName: "Slack Technologies, LLC",
    vendorAccessToken: PORTAL.por3,
    sentToVendorAt: new Date("2026-03-20T14:00:00Z"),
    rulePackId: "pack_adobe_procurement",
  });

  const porDeal4 = await ensureDeal({
    commercialId: "POR-4",
    commercialTypeId: "ctype_por",
    recordType: "ORDER_FORM",
    title: "Datadog — Observability renewal (issues open)",
    direction: "ORG_BUYING",
    status: "ISSUES_OPEN",
    documentId: docPor4,
    contractId: null,
    ownerId: userId,
    vendorEmail: "legal@datadog.example",
    vendorName: "Datadog, Inc.",
    vendorAccessToken: PORTAL.por4,
    sentToVendorAt: new Date("2026-03-10T11:00:00Z"),
    rulePackId: "pack_adobe_procurement",
  });

  await ensureReviewIssues(porDeal4.id, [
    {
      severity: "HIGH",
      title: "Liability cap below policy minimum",
      description: "Vendor MSA caps liability at fees paid in the prior month. Org policy requires 12-month fees or $500k minimum.",
      status: "OPEN",
      raisedBySide: "SYSTEM",
    },
    {
      severity: "MEDIUM",
      title: "Auto-renewal notice period",
      description: "Contract requires 90-day non-renewal notice; standard is 30 days for SaaS renewals under $250k.",
      status: "OPEN",
      raisedBySide: "ORG",
    },
  ]);

  // Attach realistic "vendor paper" to the submitted deals so extraction and the
  // compliance check have real text to evaluate (simulates the uploaded PDF).
  for (const { docId, vendor } of [
    { docId: porDeal3.documentId, vendor: "Slack Technologies, LLC" },
    { docId: porDeal4.documentId, vendor: "Datadog, Inc." },
  ]) {
    if (!docId) continue;
    const bytes = await renderTextPagePdf(`${vendor} — Master Subscription Agreement`, vendorPaperLines(vendor));
    if (bytes) await appendDocumentVersion(docId, bytes, `${vendor} — Master Subscription Agreement`, userId, "vendor uploaded paper");
  }

  // Bump ID sequences so user-created records continue after demo IDs
  for (const [prefix, nextVal] of [
    ["SMCW", 2],
    ["SCW", 2],
    ["SOR", 3],
    ["SAM", 2],
    ["PMCW", 2],
    ["PCW", 2],
    ["POR", 5],
  ]) {
    await prisma.commercialIdSequence.upsert({
      where: { prefix },
      update: { nextVal: Math.max(nextVal, 2) },
      create: { prefix, nextVal },
    });
  }

  console.log("  - Sales: SMCW-1 → SCW-1 → SOR-1 / SOR-2 / SAM-1");
  console.log("  - Procurement: PMCW-1 → PCW-1 → POR-1; tail-spend POR-2/3/4 (vendor paper flows)");
}

/** Link existing demo rows and unify CSMCW-* → SMCW-* style IDs. */
async function backfillDemoLinks() {
  const deals = await prisma.deal.findMany({ where: { commercialId: { not: null } } });
  for (const deal of deals) {
    let contract =
      (deal.contractId ? await prisma.contract.findUnique({ where: { id: deal.contractId } }) : null) ??
      (await prisma.contract.findFirst({ where: { commercialId: deal.commercialId } })) ??
      (await prisma.contract.findFirst({
        where: { commercialId: `C${deal.commercialId}` },
      }));
    if (!contract) continue;
    await prisma.deal.update({ where: { id: deal.id }, data: { contractId: contract.id, commercialId: deal.commercialId } });
    await prisma.contract.update({
      where: { id: contract.id },
      data: { dealId: deal.id, commercialId: deal.commercialId },
    });
  }
}

async function main() {
  console.log("Seeding users:");
  let managerId = null;
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, isActive: true },
      create: { email: u.email, name: u.name, role: u.role, passwordHash, isActive: true },
    });
    if (u.role === "MANAGER") managerId = row.id;
    console.log(`  - ${u.role.padEnd(8)} ${u.email}  (password: ${u.password})`);
  }
  await seedAuthoring();
  await seedPcwHierarchy();
  if (managerId) await seedCompliancePacks(managerId);
  if (managerId) await seedFileTemplates(managerId);
  if (managerId) await seedDemo(managerId);
  await backfillDemoLinks();
  await repairDocumentFiles();
  await normalizeExistingClauses();
  await backfillDemoContractPdfs();
  await enrichDemoAttributes(prisma);
  printDemoFlowGuide();
  console.log("Seed complete. Sign in as manager@local.test / Manager123!");
  console.log("Workflow: Deals (negotiate) → Contracts (clauses) → Documents (PDFs). Signing starts from Deals only.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

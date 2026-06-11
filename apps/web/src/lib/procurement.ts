import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine, intelligence } from "@/lib/services/client";
import { documentStorageKey, latestVersion, loadVersionBytes } from "@/lib/documents";
import { applyOrgBrandingToPdf } from "@/lib/org-branding";
import { roleAtLeast, type Actor } from "@/lib/rbac";

export { getOrgSettings } from "@/lib/org-branding";

export type DealStatus =
  | "DRAFT"
  | "WITH_VENDOR"
  | "VENDOR_SUBMITTED"
  | "UNDER_REVIEW"
  | "ISSUES_OPEN"
  | "APPROVED"
  | "SIGNING"
  | "COMPLETED";

/** Deal statuses where the vendor portal allows PDF upload and clause edits. */
export const VENDOR_NEGOTIATION_STATUSES: DealStatus[] = [
  "DRAFT",
  "WITH_VENDOR",
  "ISSUES_OPEN",
  "VENDOR_SUBMITTED",
];

export function vendorCanNegotiate(status: string): boolean {
  return VENDOR_NEGOTIATION_STATUSES.includes(status as DealStatus);
}

export function vendorToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function canAccessDeal(actor: Actor, dealId: string): Promise<boolean> {
  if (roleAtLeast(actor.role, "MANAGER")) return true;
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } });
  return deal?.ownerId === actor.id;
}

/** Minimal valid single-page PDF for deals awaiting vendor upload or org draft. */
const PLACEHOLDER_PDF = Buffer.from(
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

export async function createPlaceholderDocument(
  title: string,
  ownerId: string,
  note = "placeholder — awaiting content",
): Promise<string> {
  const doc = await prisma.document.create({ data: { title, ownerId } });
  const key = documentStorageKey(doc.id, 1);
  await storage().put(key, PLACEHOLDER_PDF, "application/pdf");
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storageKey: key,
      byteSize: PLACEHOLDER_PDF.byteLength,
      pageCount: 1,
      originalFilename: "placeholder.pdf",
      createdById: ownerId,
      note,
    },
  });
  return doc.id;
}

export async function copyDocumentFromTemplate(
  sourceDocumentId: string,
  title: string,
  ownerId: string,
  note: string,
): Promise<string> {
  const srcVer = await latestVersion(sourceDocumentId);
  if (!srcVer) throw new Error("template document has no version");

  const bytes = await loadVersionBytes(srcVer.storageKey);
  const branded = await applyOrgBrandingToPdf(bytes, srcVer.originalFilename ?? undefined);
  const pdf = branded.pdf;
  const pageCount = branded.pageCount || srcVer.pageCount;

  const doc = await prisma.document.create({ data: { title, ownerId } });
  const key = documentStorageKey(doc.id, 1);
  await storage().put(key, pdf, "application/pdf");
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storageKey: key,
      byteSize: pdf.byteLength,
      pageCount,
      originalFilename: srcVer.originalFilename,
      createdById: ownerId,
      note,
    },
  });
  return doc.id;
}

export async function appendDocumentVersion(
  documentId: string,
  bytes: Buffer,
  ownerId: string,
  note: string,
  filename?: string,
): Promise<number> {
  const prev = await latestVersion(documentId);
  const nextVer = (prev?.version ?? 0) + 1;
  let pageCount = 0;
  try {
    const info = await pdfEngine.info(bytes, filename);
    pageCount = Number(info.pages ?? 0);
  } catch {
    pageCount = prev?.pageCount ?? 0;
  }
  const key = documentStorageKey(documentId, nextVer);
  await storage().put(key, bytes, "application/pdf");
  await prisma.documentVersion.create({
    data: {
      documentId,
      version: nextVer,
      storageKey: key,
      byteSize: bytes.byteLength,
      pageCount,
      originalFilename: filename,
      createdById: ownerId,
      note,
    },
  });
  return nextVer;
}

export async function runComplianceCheck(dealId: string, actorId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { rulePack: true },
  });
  if (!deal) throw new Error("deal not found");

  let rulesText = deal.rulePack?.rulesText ?? null;

  if (!rulesText) {
    const fallback = await prisma.complianceRulePack.findFirst({
      where: { active: true, direction: deal.direction },
      orderBy: { createdAt: "desc" },
    });
    if (fallback?.rulesText) {
      rulesText = fallback.rulesText;
      await prisma.deal.update({ where: { id: dealId }, data: { rulePackId: fallback.id } });
    }
  }

  if (!rulesText) {
    throw new Error(
      "no compliance rule pack for this direction — upload Adobe T&C in Org settings (Procurement or Sales)",
    );
  }
  const text = await getDealDocumentText(deal.documentId);
  if (!text) throw new Error("document has no text");

  const standards = rulesText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 10)
    .slice(0, 30)
    .map((line, i) => ({ title: `Rule ${i + 1}`, text: line }));

  const { findings } = await intelligence.redline(text, standards);
  const issues = [];
  for (const f of findings ?? []) {
    const status = String(f.status ?? "").toUpperCase();
    if (status === "PRESENT" || status === "MATCH") continue;
    const issue = await prisma.reviewIssue.create({
      data: {
        dealId,
        severity: status === "MISSING" ? "HIGH" : "MEDIUM",
        title: String(f.clause ?? "Compliance finding"),
        description: [f.note, f.suggestion].filter(Boolean).join(" — ") || "Review required",
        raisedBySide: "SYSTEM",
        raisedById: actorId,
      },
    });
    issues.push(issue);
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: { status: issues.length ? "ISSUES_OPEN" : "UNDER_REVIEW" },
  });

  return issues;
}

async function getDealDocumentText(documentId: string): Promise<string | null> {
  const version = await latestVersion(documentId);
  if (!version) return null;
  const bytes = await loadVersionBytes(version.storageKey);
  const extracted = await pdfEngine.extractText(bytes, version.originalFilename ?? undefined);
  return extracted.pages.map((p) => p.text).join("\n");
}

export function dealStatusLabel(status: string, direction: string): string {
  const selling = direction === "ORG_SELLING";
  const map: Record<string, string> = {
    DRAFT: "Draft",
    WITH_VENDOR: selling ? "With customer" : "With vendor",
    VENDOR_SUBMITTED: selling ? "Customer submitted" : "Vendor submitted",
    UNDER_REVIEW: "Under review",
    ISSUES_OPEN: "Issues open",
    APPROVED: "Approved",
    SIGNING: "Signing",
    COMPLETED: "Completed",
  };
  return map[status] ?? status;
}

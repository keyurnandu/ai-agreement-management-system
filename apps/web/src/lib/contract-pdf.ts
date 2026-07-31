import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";
import { documentStorageKey } from "@/lib/documents";
import { composeContractHtml, CONTRACT_DOCUMENT_CSS } from "@/lib/authoring";
import { normalizeLineItems } from "@/lib/master-data";
import { applyOrgBrandingToPdf } from "@/lib/org-branding";
import { computeVersionDiff, saveDealDiff, saveClauseChangeDiff } from "@/lib/document-diff";
import type { VersionDiff } from "@/lib/document-diff";
import type { ClauseChange } from "@/lib/clause-diff";
import { isNoisyLineDiff } from "@/lib/text-diff";

/** Render contract clauses to PDF and attach to the linked deal document when present. */
export async function publishContractAsPdf(opts: {
  contractId: string;
  actorId: string;
  note?: string;
  clauseChange?: ClauseChange;
}): Promise<{ documentId: string; pageCount: number; version: number; diff: VersionDiff | null }> {
  const c = await prisma.contract.findUnique({
    where: { id: opts.contractId },
    include: { clauses: { orderBy: { order: "asc" } } },
  });
  if (!c) throw new Error("contract not found");
  // Never publish an empty contract — it would overwrite the deal's live
  // document (possibly the negotiated vendor file) with a title-only PDF.
  if (c.clauses.length === 0) throw new Error("Add at least one clause before generating the document.");

  const lineItems = normalizeLineItems(c.lineItems);
  const html = composeContractHtml(c.title, c.clauses, lineItems);
  const { pdf: rawPdf } = await pdfEngine.contractDocument(html, CONTRACT_DOCUMENT_CSS.trim());
  const branded = await applyOrgBrandingToPdf(rawPdf, `${c.title}.pdf`);
  const pdf = branded.pdf;
  const pageCount = branded.pageCount ?? (await pdfEngine.info(pdf)).pages ?? 1;

  const deal = c.dealId
    ? await prisma.deal.findUnique({
        where: { id: c.dealId },
        select: { id: true, documentId: true, ownerId: true },
      })
    : null;

  const targetDocumentId = deal?.documentId ?? c.documentId ?? null;
  let documentId: string;
  let fromVersion = 0;
  let toVersion = 1;

  if (targetDocumentId) {
    documentId = targetDocumentId;
    const latest = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: "desc" },
    });
    fromVersion = latest?.version ?? 0;
    toVersion = fromVersion + 1;
    const key = documentStorageKey(documentId, toVersion);
    await storage().put(key, pdf, "application/pdf");
    await prisma.documentVersion.create({
      data: {
        documentId,
        version: toVersion,
        storageKey: key,
        byteSize: pdf.byteLength,
        pageCount,
        originalFilename: `${c.title}.pdf`,
        createdById: opts.actorId,
        note: opts.note ?? "generated from contract clauses",
      },
    });
    await prisma.document.update({ where: { id: documentId }, data: { title: c.title } });
  } else {
    const doc = await prisma.document.create({ data: { title: c.title, ownerId: opts.actorId } });
    documentId = doc.id;
    const key = documentStorageKey(documentId, 1);
    await storage().put(key, pdf, "application/pdf");
    await prisma.documentVersion.create({
      data: {
        documentId,
        version: 1,
        storageKey: key,
        byteSize: pdf.byteLength,
        pageCount,
        originalFilename: `${c.title}.pdf`,
        createdById: opts.actorId,
        note: opts.note ?? "generated from contract clauses",
      },
    });
  }

  await prisma.contract.update({
    where: { id: c.id },
    data: { documentId, status: "GENERATED" },
  });
  if (deal) {
    await prisma.deal.update({ where: { id: deal.id }, data: { documentId } });
  }

  let diff: VersionDiff | null = null;
  if (deal && opts.clauseChange) {
    await saveClauseChangeDiff(deal.id, {
      fromVersion,
      toVersion,
      change: opts.clauseChange,
    });
    diff = {
      fromVersion,
      toVersion,
      summary: `Updated clause ${opts.clauseChange.order}. ${opts.clauseChange.title}`,
      lines: { clauseChanges: [opts.clauseChange] },
      stats: { added: 1, removed: 1 },
      clauseChanges: [opts.clauseChange],
    };
  } else if (deal && fromVersion > 0) {
    diff = (await computeVersionDiff(documentId, fromVersion, toVersion)) ?? null;
    const lineArr = diff && Array.isArray(diff.lines) ? diff.lines : [];
    if (diff && !isNoisyLineDiff(lineArr)) await saveDealDiff(deal.id, diff);
  }

  return { documentId, pageCount, version: toVersion, diff };
}

/** True when the document is an empty seed placeholder (not generated from clauses). */
export async function isPlaceholderDocument(documentId: string): Promise<boolean> {
  const version = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { version: "desc" },
    select: { byteSize: true, note: true },
  });
  if (!version) return true;
  if (version.note?.includes("demo shell") || version.note?.includes("placeholder")) return true;
  return version.byteSize < 2048;
}

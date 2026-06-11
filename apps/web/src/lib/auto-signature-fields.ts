import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";
import { documentStorageKey, latestVersion, loadVersionBytes } from "@/lib/documents";
import { layoutSignatureBlocks } from "@/lib/signature-layout";

const SIG_PAGE_NOTE = "signature-page appended for e-sign";

/** Append a dedicated signature page if the document does not have one yet. */
export async function ensureSignaturePage(documentId: string, actorId: string, signers: { name: string | null; email: string; role: string }[]) {
  const current = await latestVersion(documentId);
  if (!current) throw new Error("document has no PDF version");

  if (current.note?.includes(SIG_PAGE_NOTE)) {
    return current.pageCount ?? 1;
  }

  const bytes = await loadVersionBytes(current.storageKey);
  const partyLines = signers.map((s) => `• ${s.name?.trim() || s.email} (${s.role})`);
  const { pdf: sigPage } = await pdfEngine.textPage("Signature Page", [
    "IN WITNESS WHEREOF, the parties have executed this agreement as of the dates below.",
    "",
    "Signatories:",
    ...partyLines,
    "",
    "Each party shall sign below.",
  ]);

  const { pdf: merged, pageCount } = await pdfEngine.merge([
    { bytes, filename: current.originalFilename ?? "document.pdf" },
    { bytes: sigPage, filename: "signature-page.pdf" },
  ]);

  const newVersion = current.version + 1;
  const key = documentStorageKey(documentId, newVersion);
  await storage().put(key, merged, "application/pdf");
  await prisma.documentVersion.create({
    data: {
      documentId,
      version: newVersion,
      storageKey: key,
      byteSize: merged.byteLength,
      pageCount,
      originalFilename: current.originalFilename,
      createdById: actorId,
      note: SIG_PAGE_NOTE,
    },
  });

  return pageCount ?? current.pageCount ?? 1;
}

/** Replace draft fields with standard signature / name / title / date blocks. */
export async function autoPlaceSignatureFields(agreementId: string, actorId: string) {
  const ag = await prisma.agreement.findUnique({
    where: { id: agreementId },
    include: { recipients: { orderBy: { routingOrder: "asc" } } },
  });
  if (!ag) throw new Error("agreement not found");
  if (ag.status !== "DRAFT") throw new Error("can only auto-place on draft agreements");

  const signers = ag.recipients.filter((r) => r.role === "SIGNER" || r.role === "APPROVER");
  if (signers.length === 0) throw new Error("add at least one signer");

  const signaturePage = await ensureSignaturePage(
    ag.documentId,
    actorId,
    signers.map((s) => ({ name: s.name, email: s.email, role: s.role })),
  );

  await prisma.field.deleteMany({ where: { agreementId } });

  const specs = layoutSignatureBlocks(signaturePage, signers);
  await prisma.field.createMany({
    data: specs.map((s) => ({
      agreementId,
      recipientId: s.recipientId,
      type: s.type,
      label: s.label,
      page: s.page,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      required: s.required,
    })),
  });

  return { fieldCount: specs.length, signaturePage };
}

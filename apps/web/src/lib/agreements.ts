import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine, type StampItem } from "@/lib/services/client";
import { recordAudit } from "@/lib/audit";
import { emitEvent } from "@/lib/webhooks";
import { canAccessDocument, documentStorageKey, latestVersion, loadVersionBytes } from "@/lib/documents";
import { importProcurementProductsFromDeal } from "@/lib/master-data";
import type { Actor } from "@/lib/rbac";

export const FIELD_TYPES = ["SIGNATURE", "INITIAL", "DATE", "TEXT", "CHECKBOX"];
export const RECIPIENT_ROLES = ["SIGNER", "APPROVER", "CC"];

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Returns the agreement only if the actor may manage it (MANAGE on its document). */
export async function getManageableAgreement(actor: Actor, agreementId: string) {
  const ag = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!ag) return null;
  return (await canAccessDocument(actor, ag.documentId, "MANAGE")) ? ag : null;
}

const VOIDABLE_STATUSES = ["SENT", "IN_PROGRESS", "COMPLETED"] as const;

/** Cancel a sent or completed agreement so linked deals/documents can be removed. */
export async function voidAgreement(agreementId: string): Promise<void> {
  const ag = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!ag) throw new Error("agreement not found");
  if (ag.status === "VOIDED") throw new Error("agreement is already voided");
  if (ag.status === "DRAFT") throw new Error("delete a draft agreement instead of voiding");
  if (!VOIDABLE_STATUSES.includes(ag.status as (typeof VOIDABLE_STATUSES)[number])) {
    throw new Error(`Cannot void agreement in ${ag.status} status`);
  }

  await prisma.agreement.update({ where: { id: agreementId }, data: { status: "VOIDED" } });
  await prisma.recipient.updateMany({
    where: { agreementId, status: { notIn: ["SIGNED", "DECLINED"] } },
    data: { accessToken: null },
  });
}

export function agreementCanVoid(status: string): boolean {
  return VOIDABLE_STATUSES.includes(status as (typeof VOIDABLE_STATUSES)[number]);
}

/** Flips an agreement to EXPIRED if its expiry has passed. Returns true if it is (now) expired. */
export async function enforceExpiry(ag: { id: string; status: string; expiresAt: Date | null }): Promise<boolean> {
  const open = ag.status !== "COMPLETED" && ag.status !== "DECLINED" && ag.status !== "EXPIRED";
  if (open && ag.expiresAt && new Date() > ag.expiresAt) {
    await prisma.agreement.update({ where: { id: ag.id }, data: { status: "EXPIRED" } });
    return true;
  }
  return false;
}

/** Sequential routing: promote the next pending non-CC recipient to SENT. Parallel: no-op. */
export async function advanceRouting(agreementId: string): Promise<void> {
  const ag = await prisma.agreement.findUnique({
    where: { id: agreementId },
    include: { recipients: true },
  });
  if (!ag || ag.routingType === "PARALLEL") return;

  const next = ag.recipients
    .filter((r) => r.role !== "CC" && r.status !== "SIGNED" && r.status !== "DECLINED")
    .sort((a, b) => a.routingOrder - b.routingOrder)[0];

  if (next && next.status === "PENDING") {
    await prisma.recipient.update({ where: { id: next.id }, data: { status: "SENT" } });
  }
}

function fieldValue(
  fields: { recipientId: string | null; type: string; label: string | null; value: string | null }[],
  recipientId: string,
  type: string,
  label?: string,
): string | null {
  const f = fields.find(
    (x) =>
      x.recipientId === recipientId &&
      x.type === type &&
      (label === undefined || x.label === label) &&
      x.value?.trim(),
  );
  return f?.value?.trim() ?? null;
}

function buildCompletionCertificate(
  ag: { id: string; title: string; documentId: string; routingType: string },
  recipients: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    signedAt: Date | null;
  }[],
  fields: { recipientId: string | null; type: string; label: string | null; value: string | null }[],
  signEvents: { ip: string | null; userAgent: string | null; createdAt: Date; metadata: unknown }[],
): string[] {
  const signers = recipients.filter((r) => r.role === "SIGNER" || r.role === "APPROVER");
  const lines = [
    "CERTIFICATE OF COMPLETION",
    "",
    `Agreement: ${ag.title}`,
    `Document ID: ${ag.documentId}`,
    `Agreement ID: ${ag.id}`,
    `Routing: ${ag.routingType}`,
    `Completed (UTC): ${new Date().toISOString()}`,
    "",
    "── Signatory audit trail ──",
  ];

  for (const r of signers) {
    const ev = signEvents.find(
      (e) => (e.metadata as { recipientId?: string } | null)?.recipientId === r.id,
    );
    const printedName = fieldValue(fields, r.id, "TEXT", "Name") ?? r.name ?? "—";
    const title = fieldValue(fields, r.id, "TEXT", "Title") ?? "—";
    const date = fieldValue(fields, r.id, "DATE", "Date") ?? "—";
    const signed = r.signedAt ? r.signedAt.toISOString() : "—";

    lines.push("");
    lines.push(`Signer: ${r.email} (${r.role})`);
    lines.push(`  Printed name: ${printedName}`);
    lines.push(`  Title: ${title}`);
    lines.push(`  Date signed: ${date}`);
    lines.push(`  Timestamp (UTC): ${signed}`);
    lines.push(`  IP address: ${ev?.ip?.trim() || "not recorded"}`);
    lines.push(`  User agent: ${ev?.userAgent?.trim() || "not recorded"}`);
    if (ev) lines.push(`  Audit recorded (UTC): ${ev.createdAt.toISOString()}`);
  }

  lines.push("");
  lines.push("This certificate was appended automatically upon completion.");
  return lines;
}

/** If every SIGNER/APPROVER has signed, stamp the values into a new signed PDF version and complete. */
export async function maybeFinalizeAgreement(agreementId: string): Promise<boolean> {
  const ag = await prisma.agreement.findUnique({
    where: { id: agreementId },
    include: { recipients: true, fields: true },
  });
  if (!ag) return false;
  // Already finalized — don't stamp a second signed version or re-emit
  // completion side-effects (guards double-submit / re-entry after completion).
  if (ag.status === "COMPLETED") return true;

  const signers = ag.recipients.filter((r) => r.role === "SIGNER" || r.role === "APPROVER");
  const allSigned = signers.length > 0 && signers.every((r) => r.status === "SIGNED");
  if (!allSigned) return false;

  const recipientById = new Map(ag.recipients.map((r) => [r.id, r]));
  const stamps: StampItem[] = ag.fields
    .filter((f) => f.value)
    .map((f) => ({
      page: f.page,
      x: f.x,
      y: f.y,
      w: f.width,
      h: f.height,
      text: f.value as string,
      label:
        f.type === "SIGNATURE"
          ? `Signed by ${recipientById.get(f.recipientId ?? "")?.email ?? "recipient"}`
          : f.label ?? undefined,
    }));

  const current = await latestVersion(ag.documentId);
  if (!current) return false;

  const bytes = await loadVersionBytes(current.storageKey);
  const { pdf: stamped } = await pdfEngine.stamp(bytes, current.originalFilename ?? undefined, stamps);

  const signEvents = await prisma.auditEvent.findMany({
    where: { resourceId: agreementId, action: "recipient.sign" },
    orderBy: { createdAt: "asc" },
  });

  const certLines = buildCompletionCertificate(ag, ag.recipients, ag.fields, signEvents);
  const { pdf: cert } = await pdfEngine.textPage("Certificate of Completion", certLines);
  const { pdf: final, pageCount } = await pdfEngine.merge([
    { bytes: stamped, filename: "signed.pdf" },
    { bytes: cert, filename: "certificate.pdf" },
  ]);

  const newVersion = current.version + 1;
  const key = documentStorageKey(ag.documentId, newVersion);
  await storage().put(key, final, "application/pdf");
  await prisma.documentVersion.create({
    data: {
      documentId: ag.documentId,
      version: newVersion,
      storageKey: key,
      byteSize: final.byteLength,
      pageCount,
      originalFilename: current.originalFilename,
      note: "signed & completed (with certificate)",
    },
  });

  await prisma.agreement.update({
    where: { id: agreementId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  const linkedDeal = await prisma.deal.findFirst({ where: { agreementId } });
  if (linkedDeal && linkedDeal.status === "SIGNING") {
    await prisma.deal.update({ where: { id: linkedDeal.id }, data: { status: "COMPLETED" } });
  }

  // Procurement: capture the signed agreement's product-level details into the
  // master-data catalog (editable afterward). Best-effort — never blocks signing.
  if (linkedDeal && linkedDeal.direction === "ORG_BUYING") {
    try {
      await importProcurementProductsFromDeal(
        { id: linkedDeal.id, documentId: linkedDeal.documentId, vendorName: linkedDeal.vendorName, direction: linkedDeal.direction },
        linkedDeal.ownerId,
      );
    } catch {
      /* extraction unavailable — leave the catalog untouched */
    }
  }

  await recordAudit({
    action: "agreement.completed",
    resourceType: "AGREEMENT",
    resourceId: agreementId,
    metadata: { signedVersion: newVersion, signers: signers.length },
  });
  await emitEvent("agreement.completed", { agreementId, documentId: ag.documentId, signedVersion: newVersion });
  return true;
}

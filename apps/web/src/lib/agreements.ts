import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine, type StampItem } from "@/lib/services/client";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument, documentStorageKey, latestVersion, loadVersionBytes } from "@/lib/documents";
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

/** If every SIGNER/APPROVER has signed, stamp the values into a new signed PDF version and complete. */
export async function maybeFinalizeAgreement(agreementId: string): Promise<boolean> {
  const ag = await prisma.agreement.findUnique({
    where: { id: agreementId },
    include: { recipients: true, fields: true },
  });
  if (!ag) return false;

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
          : undefined,
    }));

  const current = await latestVersion(ag.documentId);
  if (!current) return false;

  const bytes = await loadVersionBytes(current.storageKey);
  const { pdf: stamped } = await pdfEngine.stamp(bytes, current.originalFilename ?? undefined, stamps);

  // Certificate of completion (appended as a final page).
  const signEvents = await prisma.auditEvent.findMany({
    where: { resourceId: agreementId, action: "recipient.sign" },
  });
  const ipByRecipient = new Map<string, string>();
  for (const e of signEvents) {
    const rid = (e.metadata as { recipientId?: string } | null)?.recipientId;
    if (rid && e.ip) ipByRecipient.set(rid, e.ip);
  }
  const lines = [
    `Agreement: ${ag.title}`,
    `Document ID: ${ag.documentId}`,
    `Routing: ${ag.routingType}`,
    `Completed: ${new Date().toISOString()}`,
    "",
    "Recipients:",
    ...ag.recipients.map(
      (r) =>
        `  - ${r.email} (${r.role}) - ${r.status}` +
        (r.signedAt ? ` at ${new Date(r.signedAt).toISOString()}` : "") +
        (ipByRecipient.get(r.id) ? ` | IP ${ipByRecipient.get(r.id)}` : ""),
    ),
    "",
    `Certificate ID: ${agreementId}`,
  ];
  const { pdf: cert } = await pdfEngine.textPage("Certificate of Completion", lines);
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
  await recordAudit({
    action: "agreement.completed",
    resourceType: "AGREEMENT",
    resourceId: agreementId,
    metadata: { signedVersion: newVersion, signers: signers.length },
  });
  return true;
}

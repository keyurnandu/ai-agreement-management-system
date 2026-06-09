import { storage } from "@/lib/adapters/storage";
import { prisma } from "@/lib/db";
import { pdfEngine } from "@/lib/services/client";
import { levelAtLeast, roleAtLeast, type Actor, type PermissionLevel } from "@/lib/rbac";

export function documentStorageKey(documentId: string, version: number): string {
  return `documents/${documentId}/v${version}.pdf`;
}

/**
 * Document access: managers+ org-wide, the owner always, otherwise a per-resource
 * Permission row at the required level.
 */
export async function canAccessDocument(
  actor: Actor,
  documentId: string,
  level: PermissionLevel,
): Promise<boolean> {
  if (roleAtLeast(actor.role, "MANAGER")) return true;
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true },
  });
  if (!doc) return false;
  if (doc.ownerId === actor.id) return true;
  const perm = await prisma.permission.findFirst({ where: { userId: actor.id, documentId } });
  return !!perm && levelAtLeast(perm.level, level);
}

export async function latestVersion(documentId: string) {
  return prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { version: "desc" },
  });
}

export async function loadVersionBytes(storageKey: string): Promise<Buffer> {
  return storage().get(storageKey);
}

/** Extract the latest version's text via the PDF engine. Returns null if no version. */
export async function getDocumentText(documentId: string): Promise<string | null> {
  const version = await latestVersion(documentId);
  if (!version) return null;
  const bytes = await loadVersionBytes(version.storageKey);
  const extracted = await pdfEngine.extractText(bytes, version.originalFilename ?? undefined);
  return extracted.pages.map((p) => p.text).join("\n");
}

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface AuditInput {
  action: string; // e.g. "document.upload", "agreement.send", "auth.login"
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only audit log. Every state-changing action in the system should call
 * this. It deliberately swallows its own errors so a logging failure can never
 * break the user's operation — but it shouts to the server console.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error(`[audit] failed to record "${input.action}":`, err);
  }
}

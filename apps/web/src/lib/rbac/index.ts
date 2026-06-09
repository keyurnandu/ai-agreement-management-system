import { prisma } from "@/lib/db";

export type Role = "ADMIN" | "MANAGER" | "EDITOR" | "SIGNER" | "VIEWER";
export type PermissionLevel = "VIEW" | "COMMENT" | "EDIT" | "MANAGE";
export type ResourceType = "DOCUMENT" | "AGREEMENT";

export const ROLES: Role[] = ["ADMIN", "MANAGER", "EDITOR", "SIGNER", "VIEWER"];

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  SIGNER: 1,
  EDITOR: 2,
  MANAGER: 3,
  ADMIN: 4,
};

const LEVEL_RANK: Record<PermissionLevel, number> = {
  VIEW: 0,
  COMMENT: 1,
  EDIT: 2,
  MANAGE: 3,
};

/** Coarse, org-wide role check. */
export function roleAtLeast(role: string, min: Role): boolean {
  return (ROLE_RANK[role as Role] ?? -1) >= ROLE_RANK[min];
}

export function levelAtLeast(level: string, min: PermissionLevel): boolean {
  return (LEVEL_RANK[level as PermissionLevel] ?? -1) >= LEVEL_RANK[min];
}

export interface Actor {
  id: string;
  role: string;
}

/**
 * Resource-level authorization. Managers and admins have org-wide access;
 * everyone else must hold a per-resource Permission row at the required level.
 */
export async function authorizeResource(
  actor: Actor,
  resourceType: ResourceType,
  resourceId: string,
  min: PermissionLevel,
): Promise<boolean> {
  if (roleAtLeast(actor.role, "MANAGER")) return true;

  const perm = await prisma.permission.findFirst({
    where:
      resourceType === "DOCUMENT"
        ? { userId: actor.id, documentId: resourceId }
        : { userId: actor.id, agreementId: resourceId },
  });

  return !!perm && levelAtLeast(perm.level, min);
}

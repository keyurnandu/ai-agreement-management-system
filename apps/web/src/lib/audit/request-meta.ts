import type { AuditInput } from "@/lib/audit";

/** Client IP + browser from an incoming request (proxy-aware). */
export function auditRequestMeta(req: Request): Pick<AuditInput, "ip" | "userAgent"> {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
  return {
    ip,
    userAgent: req.headers.get("user-agent"),
  };
}

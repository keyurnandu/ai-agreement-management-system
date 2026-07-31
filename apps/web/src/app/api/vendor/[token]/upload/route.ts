import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { appendDocumentVersion, vendorCanNegotiate } from "@/lib/procurement";
import { latestVersion } from "@/lib/documents";
import { computeVersionDiff, saveDealDiff } from "@/lib/document-diff";
import { isNoisyLineDiff } from "@/lib/text-diff";
import { sendRevisionNotice } from "@/lib/adapters/email";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const deal = await prisma.deal.findUnique({ where: { vendorAccessToken: token } });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!vendorCanNegotiate(deal.status)) {
    return NextResponse.json({ error: "upload not allowed in current status" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  // Bound memory use on this public, token-only endpoint before buffering.
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "file too large (max 30 MB)" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "PDF only" }, { status: 415 });
  }

  const prevVer = await latestVersion(deal.documentId);
  const prevNum = prevVer?.version ?? 0;

  const version = await appendDocumentVersion(
    deal.documentId,
    bytes,
    deal.ownerId,
    `vendor revision from ${deal.vendorEmail}`,
    file.name,
  );

  let diffSummary: string | null = null;
  if (prevNum > 0) {
    const diff = await computeVersionDiff(deal.documentId, prevNum, version);
    if (diff) {
      const lineArr = Array.isArray(diff.lines) ? diff.lines : [];
      if (!isNoisyLineDiff(lineArr)) await saveDealDiff(deal.id, diff);
      diffSummary = diff.summary;
    }
  }

  await prisma.deal.update({
    where: { id: deal.id },
    data: {
      status: "VENDOR_SUBMITTED",
      ...(deal.status === "DRAFT" && !deal.sentToVendorAt ? { sentToVendorAt: new Date() } : {}),
    },
  });
  await recordAudit({
    action: "deal.vendor_upload",
    actorEmail: deal.vendorEmail,
    resourceType: "DEAL",
    resourceId: deal.id,
    metadata: { version, filename: file.name, diffSummary },
    ...auditRequestMeta(req),
  });

  if (diffSummary) {
    const owner = await prisma.user.findUnique({ where: { id: deal.ownerId }, select: { email: true } });
    if (owner?.email) {
      const base = env.APP_BASE_URL.replace(/\/$/, "");
      try {
        await sendRevisionNotice({
          to: owner.email,
          dealTitle: deal.title,
          summary: diffSummary,
          dealUrl: `${base}/deals/${deal.id}`,
        });
      } catch {
        /* email optional */
      }
    }
  }

  return NextResponse.json({ version, diffSummary });
}

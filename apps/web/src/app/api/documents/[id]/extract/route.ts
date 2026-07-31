import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { emitEvent } from "@/lib/webhooks";
import { canAccessDocument } from "@/lib/documents";
import { runExtraction } from "@/lib/extraction";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "EDIT"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let keys: string[] | undefined;
  try {
    const body = (await req.json()) as { keys?: string[]; key?: string };
    keys = body.keys ?? (body.key ? [body.key] : undefined);
  } catch {
    keys = undefined;
  }

  const result = await runExtraction(id, keys);
  if (result.error) {
    const status = result.error === "not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordAudit({
    action: "document.extract",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { count: result.extracted, provider: result.provider, keys: keys ?? null },
  });
  await emitEvent("attribute.extracted", { documentId: id, count: result.extracted, provider: result.provider, keys: keys ?? null });

  return NextResponse.json({ extracted: result.extracted, provider: result.provider, keys: result.keys, chunked: result.chunked });
}

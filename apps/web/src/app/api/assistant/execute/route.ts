import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { executeAssistantAction } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { tool?: string; dealId?: string; args?: Record<string, string> };
  if (!body.tool) return NextResponse.json({ error: "tool required" }, { status: 400 });
  if (body.tool !== "create_deal" && !body.dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  await recordAudit({
    action: "assistant.execute",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "ASSISTANT",
    metadata: { tool: body.tool, dealId: body.dealId ?? null },
  });

  try {
    const result = await executeAssistantAction(
      body.tool,
      { dealId: body.dealId, args: body.args },
      { id: session.user.id, role: session.user.role, email: session.user.email },
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "assistant error";
    return NextResponse.json({ reply: `Sorry — I hit an error: ${msg}`, tool: "error" });
  }
}

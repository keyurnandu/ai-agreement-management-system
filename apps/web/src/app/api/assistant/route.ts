import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { runAssistant } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { message?: string };
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  await recordAudit({
    action: "assistant.message",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "ASSISTANT",
    metadata: { message: message.slice(0, 160) },
  });

  try {
    const result = await runAssistant(message, {
      id: session.user.id,
      role: session.user.role,
      email: session.user.email,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "assistant error";
    return NextResponse.json({ reply: `Sorry — I hit an error: ${msg}`, tool: "error" });
  }
}

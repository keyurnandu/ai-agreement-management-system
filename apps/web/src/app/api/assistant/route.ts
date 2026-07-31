import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { runAssistant } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const body = (await req.json()) as { message?: string };
  const message = body.message?.trim();
  if (!message) return new Response(JSON.stringify({ error: "message required" }), { status: 400 });

  const actor = { id: session.user.id, role: session.user.role, email: session.user.email };
  await recordAudit({
    action: "assistant.message",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "ASSISTANT",
    metadata: { message: message.slice(0, 160) },
  });

  // Stream steps as newline-delimited JSON so the UI can show them live.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await runAssistant(message, actor, (step) => emit({ type: "step", step }));
        emit({ type: "final", ...result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "assistant error";
        emit({ type: "final", reply: `Sorry — I hit an error: ${msg}`, tool: "error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { canAccessDeal, dealStatusLabel } from "@/lib/procurement";
import { answerAboutDocument } from "@/lib/document-qa";

export const dynamic = "force-dynamic";

const STATE_KEYWORDS = [
  "status", "blocking", "blocker", "blocked", "open issue", "issues", "outstanding",
  "compliant", "compliance", "what's next", "next step", "next steps", "ready to sign",
  "can we approve", "can we sign", "where is this", "what stage", "hold up", "hold-up",
];

function isStateQuestion(q: string): boolean {
  const l = q.toLowerCase();
  return STATE_KEYWORDS.some((k) => l.includes(k));
}

const NEXT_STEP: Record<string, string> = {
  DRAFT: "Send it to the counterparty to begin negotiation.",
  WITH_VENDOR: "Waiting on the counterparty in their portal — they can review, edit clauses, or upload paper.",
  VENDOR_SUBMITTED: "Review the submitted paper: run a compliance check and review the change diff.",
  UNDER_REVIEW: "Resolve any open issues, then approve the document.",
  ISSUES_OPEN: "Resolve or waive the open issues (or have the counterparty address them), then approve.",
  APPROVED: "Start signing to send the agreement to signers.",
  SIGNING: "Awaiting signatures — track progress in the signing panel.",
  COMPLETED: "Done — the agreement is fully executed.",
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDeal(actor, id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { question?: string; history?: { role: string; content: string }[] };
  const question = body.question?.trim();
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: {
      commercialId: true, title: true, status: true, direction: true,
      vendorName: true, vendorEmail: true, documentId: true, agreementId: true,
      issues: { where: { status: "OPEN" }, select: { severity: true, title: true, description: true, raisedBySide: true } },
    },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit({
    action: "deal.ask",
    actorId: actor.id, actorEmail: session.user.email,
    resourceType: "DEAL", resourceId: id,
    metadata: { question: question.slice(0, 120) },
  });

  // Deal-state questions → answer from live workflow state (no LLM).
  if (isStateQuestion(question)) {
    const label = dealStatusLabel(deal.status, deal.direction);
    const open = deal.issues;
    const counterparty = deal.vendorName ?? deal.vendorEmail;
    const parts: string[] = [];
    parts.push(`${deal.commercialId ?? "This deal"} is currently ${label}. Counterparty: ${counterparty}.`);

    if (open.length) {
      const bySys = open.filter((i) => i.raisedBySide === "SYSTEM").length;
      parts.push(
        `\n${open.length} open issue${open.length === 1 ? "" : "s"} must be resolved before approval` +
          (bySys ? ` (${bySys} from compliance)` : "") + ":",
      );
      for (const i of open.slice(0, 8)) parts.push(`• [${i.severity}] ${i.title} — ${i.description}`);
    } else {
      parts.push("\nNo open issues.");
    }
    parts.push(`\nNext step: ${NEXT_STEP[deal.status] ?? "Continue the workflow."}`);

    return NextResponse.json({
      answer: parts.join("\n"),
      citations: [],
      provider: "deal workflow",
      routed: "deal-state",
    });
  }

  // Content questions → answer from the deal's document (facts + RAG).
  if (!deal.documentId) {
    return NextResponse.json({ answer: "This deal has no document attached yet.", citations: [], provider: "deal", routed: "deal" });
  }
  const result = await answerAboutDocument(deal.documentId, question, history);
  return NextResponse.json(result);
}

import { prisma } from "@/lib/db";
import { intelligence } from "@/lib/services/client";
import { runComplianceCheck, dealStatusLabel, canAccessDeal } from "@/lib/procurement";
import { answerAboutPortfolio } from "@/lib/portfolio-qa";
import { answerAboutDocument } from "@/lib/document-qa";
import { roleAtLeast } from "@/lib/rbac";

export type Actor = { id: string; role: string; email?: string | null };

type DealLite = {
  id: string;
  commercialId: string | null;
  title: string;
  status: string;
  direction: string;
  documentId: string | null;
};

export type AssistantResult = {
  reply: string;
  tool: string;
  /** A confirmation the UI must show before the action runs. */
  proposal?: { tool: string; dealId?: string; title?: string; summary: string };
  /** Links the assistant surfaced (deals it acted on / referenced). */
  links?: { href: string; label: string }[];
};

const CONFIRM_TOOLS = new Set(["send_for_signature", "approve_deal"]);

const TOOL_CATALOG = `
- answer: Answer a question about the portfolio or a specific deal/contract. args: { dealRef?: string, question: string }
- run_compliance: Run the compliance rule-pack check on a deal. args: { dealRef: string }
- resolve_issues: Resolve every open review issue on a deal. args: { dealRef: string }
- create_collection: Create a new document collection (folder). args: { title: string }
- approve_deal: Approve a deal's document (needs 0 open issues). args: { dealRef: string }  [CONFIRM]
- send_for_signature: Approve + start signing so the agreement goes to signers. args: { dealRef: string }  [CONFIRM]
- none: Nothing to do / ask the user to clarify. args: {}
`;

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveDeal(deals: DealLite[], ref?: string): DealLite | null {
  if (!ref) return null;
  const r = ref.trim().toLowerCase();
  return (
    deals.find((d) => d.commercialId?.toLowerCase() === r) ??
    deals.find((d) => (d.commercialId?.toLowerCase().includes(r) ?? false) || d.title.toLowerCase().includes(r)) ??
    null
  );
}

function guessDirection(q: string): "ORG_SELLING" | "ORG_BUYING" {
  return /vendor|procure|purchas|buy|supplier/i.test(q) ? "ORG_BUYING" : "ORG_SELLING";
}

/** Plan a single tool call from the user's message. */
async function plan(message: string, deals: DealLite[]) {
  const catalog = deals
    .slice(0, 50)
    .map((d) => `${d.commercialId ?? d.id} — ${d.title} [${d.status}, ${d.direction === "ORG_BUYING" ? "procurement" : "sales"}]`)
    .join("\n");
  const system =
    "You are ContractIQ's operations assistant. Pick exactly ONE tool to fulfil the user's request and reply with ONLY a JSON object " +
    '{"tool": <name>, "args": {...}, "say": <one short first-person sentence>}. ' +
    "Resolve any deal reference to its short ID (e.g. POR-3) using the deal list. If the message is just a question, use the answer tool. " +
    "Tools:\n" +
    TOOL_CATALOG;
  const prompt = `DEALS:\n${catalog || "(none)"}\n\nUSER: ${message}\n\nJSON:`;
  const { text } = await intelligence.complete(prompt, system, 300);
  const parsed = extractJson(text);
  return parsed;
}

/** Run one assistant turn: plan a tool, then execute (safe) or propose (confirm). */
export async function runAssistant(message: string, actor: Actor): Promise<AssistantResult> {
  const where = roleAtLeast(actor.role, "MANAGER") ? {} : { ownerId: actor.id };
  const deals = (await prisma.deal.findMany({
    where,
    select: { id: true, commercialId: true, title: true, status: true, direction: true, documentId: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })) as DealLite[];

  const parsed = await plan(message, deals);
  const tool = String(parsed?.tool ?? "answer");
  const args = (parsed?.args ?? {}) as Record<string, string>;
  const say = typeof parsed?.say === "string" ? parsed.say : "";

  const deal = () => resolveDeal(deals, args.dealRef);
  const dealLink = (d: DealLite) => ({ href: `/deals/${d.id}`, label: d.commercialId ?? d.title });

  // ── Confirmation-required tools: propose, don't execute ──────────────────
  if (CONFIRM_TOOLS.has(tool)) {
    const d = deal();
    if (!d) return { reply: `I couldn't find that deal. Which deal did you mean?`, tool };
    const summary =
      tool === "send_for_signature"
        ? `Approve “${d.commercialId ?? d.title}” and send it for e-signature`
        : `Approve “${d.commercialId ?? d.title}”`;
    return {
      reply: say || `I can ${summary.toLowerCase()}. Confirm to proceed.`,
      tool,
      proposal: { tool, dealId: d.id, title: d.commercialId ?? d.title, summary },
      links: [dealLink(d)],
    };
  }

  // ── Safe tools: execute now ──────────────────────────────────────────────
  switch (tool) {
    case "run_compliance": {
      const d = deal();
      if (!d) return { reply: "Which deal should I run compliance on?", tool };
      if (!(await canAccessDeal(actor, d.id))) return { reply: "You don't have access to that deal.", tool };
      const issues = await runComplianceCheck(d.id, actor.id);
      const lines = issues.slice(0, 8).map((i) => `• [${i.severity}] ${i.title}`).join("\n");
      return {
        reply: issues.length
          ? `Ran compliance on ${d.commercialId ?? d.title} — ${issues.length} finding${issues.length === 1 ? "" : "s"}:\n${lines}`
          : `Ran compliance on ${d.commercialId ?? d.title} — no issues. It's clean.`,
        tool,
        links: [dealLink(d)],
      };
    }
    case "resolve_issues": {
      const d = deal();
      if (!d) return { reply: "Which deal's issues should I resolve?", tool };
      if (!(await canAccessDeal(actor, d.id))) return { reply: "You don't have access to that deal.", tool };
      const open = await prisma.reviewIssue.findMany({ where: { dealId: d.id, status: "OPEN" }, select: { id: true } });
      if (!open.length) return { reply: `${d.commercialId ?? d.title} has no open issues.`, tool, links: [dealLink(d)] };
      await prisma.reviewIssue.updateMany({
        where: { id: { in: open.map((i) => i.id) } },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      const stillOpen = await prisma.reviewIssue.count({ where: { dealId: d.id, status: "OPEN" } });
      const cur = await prisma.deal.findUnique({ where: { id: d.id }, select: { status: true } });
      if (cur && ["ISSUES_OPEN", "VENDOR_SUBMITTED", "UNDER_REVIEW"].includes(cur.status)) {
        await prisma.deal.update({ where: { id: d.id }, data: { status: stillOpen ? "ISSUES_OPEN" : "UNDER_REVIEW" } });
      }
      return { reply: `Resolved ${open.length} open issue${open.length === 1 ? "" : "s"} on ${d.commercialId ?? d.title}.`, tool, links: [dealLink(d)] };
    }
    case "create_collection": {
      const title = (args.title ?? "").trim();
      if (!title) return { reply: "What should I name the collection?", tool };
      if (!roleAtLeast(actor.role, "EDITOR")) return { reply: "You need editor access to create collections.", tool };
      const type = await prisma.commercialRecordType.findFirst({ where: { key: "dcol" }, select: { id: true, prefix: true } });
      const doc = await prisma.document.create({
        data: { title, kind: "COLLECTION", commercialTypeId: type?.id, ownerId: actor.id },
      });
      return { reply: `Created the collection “${title}”.`, tool, links: [{ href: "/documents", label: "Open documents" }] };
    }
    case "answer":
    default: {
      const question = args.question || message;
      const d = deal();
      if (d?.documentId) {
        const res = await answerAboutDocument(d.documentId, question);
        return { reply: res.answer, tool: "answer", links: [dealLink(d)] };
      }
      const res = await answerAboutPortfolio(guessDirection(question), question, roleAtLeast(actor.role, "MANAGER") ? undefined : actor.id);
      return { reply: res.answer, tool: "answer" };
    }
  }
}

/** Execute a previously-proposed confirmation action. */
export async function executeAssistantAction(tool: string, dealId: string, actor: Actor): Promise<AssistantResult> {
  const d = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, commercialId: true, title: true, status: true } });
  if (!d) return { reply: "That deal no longer exists.", tool };
  if (!(await canAccessDeal(actor, d.id))) return { reply: "You don't have access to that deal.", tool };
  const label = d.commercialId ?? d.title;
  const link = { href: `/deals/${d.id}`, label };

  const open = await prisma.reviewIssue.count({ where: { dealId: d.id, status: "OPEN" } });
  if (open > 0) {
    return { reply: `Can't approve ${label} yet — ${open} open issue${open === 1 ? "" : "s"} must be resolved first.`, tool, links: [link] };
  }

  if (tool === "approve_deal") {
    await prisma.deal.update({ where: { id: d.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    return { reply: `Approved ${label}. You can now start signing.`, tool, links: [link] };
  }
  if (tool === "send_for_signature") {
    // Approve if needed, then hand off to the signing setup on the deal.
    if (!["APPROVED", "SIGNING"].includes(d.status)) {
      await prisma.deal.update({ where: { id: d.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    }
    return {
      reply: `${label} is approved and ready to sign. Open it and use “Start signing” to place fields and send to signers.`,
      tool,
      links: [link],
    };
  }
  return { reply: "Unknown action.", tool };
}

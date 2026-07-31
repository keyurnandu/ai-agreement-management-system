import { prisma } from "@/lib/db";
import { intelligence } from "@/lib/services/client";
import { runComplianceCheck, canAccessDeal, createPlaceholderDocument, vendorToken } from "@/lib/procurement";
import { allocateCommercialId, legacyRecordType } from "@/lib/commercial-types";
import { answerAboutPortfolio } from "@/lib/portfolio-qa";
import { answerAboutDocument } from "@/lib/document-qa";
import { runExtraction } from "@/lib/extraction";
import { roleAtLeast } from "@/lib/rbac";

export type Actor = { id: string; role: string; email?: string | null };

type DealLite = { id: string; commercialId: string | null; title: string; status: string; direction: string; documentId: string | null };
type DocLite = { id: string; commercialId: string | null; title: string; kind: string; collectionParentId: string | null };
type Step = { tool: string; result: string };

export type AssistantResult = {
  reply: string;
  tool: string;
  steps?: Step[];
  proposal?: { tool: string; dealId?: string; title?: string; summary: string; args?: Record<string, string> };
  links?: { href: string; label: string }[];
};

const MAX_STEPS = 6;
const CONFIRM_TOOLS = new Set(["send_for_signature", "approve_deal", "create_deal"]);

const TOOL_CATALOG = `
- find: List deals matching a filter, to decide what to act on next. args: { filter?: "at_risk"|"expiring"|"all", direction?: "sales"|"procurement" }
- run_compliance: Run the compliance rule-pack check on a deal. args: { dealRef: string }
- resolve_issues: Resolve every open review issue on a deal. args: { dealRef: string }
- run_extraction: Extract contract data (dates, value, parties, governing law, …) from a deal's document. args: { dealRef: string }
- create_collection: Create a new document collection (folder). args: { title: string }
- move_document: Move a document into a collection. args: { docRef: string, collectionRef: string }
- answer: Answer a question about the portfolio or a specific deal (TERMINAL — ends the task). args: { dealRef?: string, question: string }
- create_deal: Create a new deal. args: { direction: "sales"|"procurement", title: string, counterparty: string }  [CONFIRM]
- approve_deal: Approve a deal's document (needs 0 open issues). args: { dealRef: string }  [CONFIRM]
- send_for_signature: Approve + start signing. args: { dealRef: string }  [CONFIRM]
- done: The task is complete. args: {}  (put the final summary in "say")
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
function resolveDoc(docs: DocLite[], ref?: string): DocLite | null {
  if (!ref) return null;
  const r = ref.trim().toLowerCase();
  return docs.find((d) => d.kind === "FILE" && (d.commercialId?.toLowerCase() === r || d.title.toLowerCase().includes(r))) ?? null;
}
function resolveCollection(docs: DocLite[], ref?: string): DocLite | null {
  if (!ref) return null;
  const r = ref.trim().toLowerCase();
  return docs.find((d) => d.kind === "COLLECTION" && (d.commercialId?.toLowerCase() === r || d.title.toLowerCase().includes(r))) ?? null;
}
function guessDirection(q: string): "ORG_SELLING" | "ORG_BUYING" {
  return /vendor|procure|purchas|buy|supplier/i.test(q) ? "ORG_BUYING" : "ORG_SELLING";
}
const dealLink = (d: DealLite) => ({ href: `/deals/${d.id}`, label: d.commercialId ?? d.title });

/** Ask the LLM for the next single tool given the task and prior step results. */
async function planNext(message: string, deals: DealLite[], docs: DocLite[], steps: Step[]) {
  const dealCat = deals
    .slice(0, 50)
    .map((d) => `${d.commercialId ?? d.id} — ${d.title} [${d.status}, ${d.direction === "ORG_BUYING" ? "procurement" : "sales"}]`)
    .join("\n");
  const collectionCat = docs.filter((d) => d.kind === "COLLECTION").slice(0, 20).map((d) => `- ${d.title}`).join("\n");
  const fileCat = docs.filter((d) => d.kind === "FILE").slice(0, 30).map((d) => `- ${d.title}`).join("\n");
  const done = steps.length
    ? "STEPS DONE:\n" + steps.map((s, i) => `${i + 1}. ${s.tool}: ${s.result.replace(/\n/g, " ").slice(0, 160)}`).join("\n")
    : "STEPS DONE: (none yet)";
  const system =
    "You are ContractIQ's operations assistant running a possibly multi-step task. " +
    "Given the user's request and the results of steps already done, choose the NEXT single tool. " +
    'Reply with ONLY JSON {"tool": <name>, "args": {...}, "say": <one short first-person sentence>}. ' +
    'When the request is fully handled, reply {"tool":"done","say":<final summary of what you did>}. ' +
    "Never repeat a step already done, and never create a collection that already exists. " +
    "Resolve deal/document/collection references to names from the lists below. Tools:\n" +
    TOOL_CATALOG;
  const prompt =
    `DEALS:\n${dealCat || "(none)"}\n\n` +
    `COLLECTIONS:\n${collectionCat || "(none)"}\n\n` +
    `DOCUMENTS:\n${fileCat || "(none)"}\n\n` +
    `USER REQUEST: ${message}\n\n${done}\n\nNext JSON:`;
  const { text } = await intelligence.complete(prompt, system, 300);
  return extractJson(text);
}

async function openIssueCounts(dealIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!dealIds.length) return m;
  const rows = await prisma.reviewIssue.findMany({ where: { dealId: { in: dealIds }, status: "OPEN" }, select: { dealId: true } });
  for (const r of rows) m.set(r.dealId, (m.get(r.dealId) ?? 0) + 1);
  return m;
}

export async function runAssistant(message: string, actor: Actor, onStep?: (step: Step) => void): Promise<AssistantResult> {
  const where = roleAtLeast(actor.role, "MANAGER") ? {} : { ownerId: actor.id };
  const deals = (await prisma.deal.findMany({
    where,
    select: { id: true, commercialId: true, title: true, status: true, direction: true, documentId: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })) as DealLite[];
  const docs = (await prisma.document.findMany({
    where,
    select: { id: true, commercialId: true, title: true, kind: true, collectionParentId: true },
    orderBy: { updatedAt: "desc" },
    take: 150,
  })) as DocLite[];
  const issueCounts = await openIssueCounts(deals.map((d) => d.id));

  const steps: Step[] = [];
  const links: { href: string; label: string }[] = [];
  let finalReply = "";

  for (let i = 0; i < MAX_STEPS; i++) {
    const plan = await planNext(message, deals, docs, steps);
    const tool = String(plan?.tool ?? "done");
    const args = (plan?.args ?? {}) as Record<string, string>;
    const say = typeof plan?.say === "string" ? plan.say : "";

    if (tool === "done" || tool === "none") {
      finalReply = say || (steps.length ? "Done." : "I'm not sure how to help with that — try asking about a deal or the portfolio.");
      break;
    }

    // Confirmation-required → stop and surface the proposal (with steps so far).
    if (CONFIRM_TOOLS.has(tool)) {
      if (tool === "create_deal") {
        const dir = /(proc|buy|vendor)/i.test(args.direction ?? "") ? "procurement" : "sales";
        const title = (args.title ?? "").trim() || "New deal";
        const counterparty = (args.counterparty ?? "").trim();
        const summary = `Create a new ${dir} deal “${title}”${counterparty ? ` with ${counterparty}` : ""}`;
        return {
          reply: say || `${summary}?`,
          tool,
          steps,
          proposal: { tool, summary, args: { direction: dir, title, counterparty } },
        };
      }
      const d = resolveDeal(deals, args.dealRef);
      if (!d) {
        finalReply = "Which deal did you mean?";
        break;
      }
      const summary = tool === "send_for_signature" ? `Approve “${d.commercialId ?? d.title}” and send it for e-signature` : `Approve “${d.commercialId ?? d.title}”`;
      return {
        reply: say || `${summary}?`,
        tool,
        steps,
        proposal: { tool, dealId: d.id, title: d.commercialId ?? d.title, summary },
        links: [dealLink(d)],
      };
    }

    // Terminal answer.
    if (tool === "answer") {
      const question = args.question || message;
      const d = resolveDeal(deals, args.dealRef);
      const res = d?.documentId
        ? await answerAboutDocument(d.documentId, question)
        : await answerAboutPortfolio(guessDirection(question), question, roleAtLeast(actor.role, "MANAGER") ? undefined : actor.id);
      if (d) links.push(dealLink(d));
      finalReply = res.answer;
      break;
    }

    // Safe, non-terminal tools.
    const { result, link } = await execSafe(tool, args, { deals, docs, issueCounts, actor });
    const step = { tool, result };
    steps.push(step);
    onStep?.(step);
    if (link) links.push(link);
  }

  if (!finalReply) finalReply = steps.length ? "Done — see the steps above." : "I couldn't complete that.";
  return { reply: finalReply, tool: "multi", steps, links: dedupeLinks(links) };
}

function dedupeLinks(links: { href: string; label: string }[]) {
  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true))).slice(0, 8);
}

async function execSafe(
  tool: string,
  args: Record<string, string>,
  ctx: { deals: DealLite[]; docs: DocLite[]; issueCounts: Map<string, number>; actor: Actor },
): Promise<{ result: string; link?: { href: string; label: string } }> {
  const { deals, docs, issueCounts, actor } = ctx;

  if (tool === "find") {
    const filter = (args.filter ?? "all").toLowerCase();
    let rows = deals;
    if (args.direction) rows = rows.filter((d) => d.direction === (/(proc|buy|vendor)/.test(args.direction!.toLowerCase()) ? "ORG_BUYING" : "ORG_SELLING"));
    if (filter === "at_risk") rows = rows.filter((d) => (issueCounts.get(d.id) ?? 0) > 0 || ["ISSUES_OPEN", "VENDOR_SUBMITTED"].includes(d.status));
    const list = rows.slice(0, 10).map((d) => `${d.commercialId ?? d.id} (${d.status}${issueCounts.get(d.id) ? `, ${issueCounts.get(d.id)} open issues` : ""})`).join("; ");
    return { result: rows.length ? `Found ${rows.length}: ${list}` : "No matching deals." };
  }

  if (tool === "run_compliance") {
    const d = resolveDeal(deals, args.dealRef);
    if (!d) return { result: "Deal not found." };
    if (!(await canAccessDeal(actor, d.id))) return { result: "No access to that deal." };
    const issues = await runComplianceCheck(d.id, actor.id);
    issueCounts.set(d.id, issues.length);
    return { result: issues.length ? `${d.commercialId}: ${issues.length} findings (${issues.map((x) => x.severity).join(",")})` : `${d.commercialId}: clean`, link: dealLink(d) };
  }

  if (tool === "resolve_issues") {
    const d = resolveDeal(deals, args.dealRef);
    if (!d) return { result: "Deal not found." };
    if (!(await canAccessDeal(actor, d.id))) return { result: "No access to that deal." };
    const open = await prisma.reviewIssue.findMany({ where: { dealId: d.id, status: "OPEN" }, select: { id: true } });
    if (!open.length) return { result: `${d.commercialId}: no open issues`, link: dealLink(d) };
    await prisma.reviewIssue.updateMany({ where: { id: { in: open.map((i) => i.id) } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    issueCounts.set(d.id, 0);
    const cur = await prisma.deal.findUnique({ where: { id: d.id }, select: { status: true } });
    if (cur && ["ISSUES_OPEN", "VENDOR_SUBMITTED", "UNDER_REVIEW"].includes(cur.status)) {
      await prisma.deal.update({ where: { id: d.id }, data: { status: "UNDER_REVIEW" } });
    }
    return { result: `${d.commercialId}: resolved ${open.length} issues`, link: dealLink(d) };
  }

  if (tool === "run_extraction") {
    const d = resolveDeal(deals, args.dealRef);
    if (!d) return { result: "Deal not found." };
    if (!d.documentId) return { result: `${d.commercialId}: no document attached.` };
    if (!(await canAccessDeal(actor, d.id))) return { result: "No access to that deal." };
    const res = await runExtraction(d.documentId);
    return { result: res.error ? `${d.commercialId}: ${res.error}` : `${d.commercialId}: extracted ${res.extracted} attributes`, link: dealLink(d) };
  }

  if (tool === "create_collection") {
    const title = (args.title ?? "").trim();
    if (!title) return { result: "No collection name given." };
    if (!roleAtLeast(actor.role, "EDITOR")) return { result: "No editor access." };
    const type = await prisma.commercialRecordType.findFirst({ where: { key: "dcol" }, select: { id: true } });
    await prisma.document.create({ data: { title, kind: "COLLECTION", commercialTypeId: type?.id, ownerId: actor.id } });
    return { result: `Created collection “${title}”`, link: { href: "/documents", label: "Documents" } };
  }

  if (tool === "move_document") {
    const doc = resolveDoc(docs, args.docRef);
    const col = resolveCollection(docs, args.collectionRef);
    if (!doc) return { result: "Document not found." };
    if (!col) return { result: "Collection not found." };
    await prisma.document.update({ where: { id: doc.id }, data: { collectionParentId: col.id } });
    doc.collectionParentId = col.id;
    return { result: `Moved “${doc.title}” into “${col.title}”`, link: { href: "/documents", label: "Documents" } };
  }

  return { result: `Unknown tool: ${tool}` };
}

/** Execute a previously-proposed confirmation action. */
export async function executeAssistantAction(
  tool: string,
  payload: { dealId?: string; args?: Record<string, string> },
  actor: Actor,
): Promise<AssistantResult> {
  // Create a new deal (no dealId — build from the proposed args).
  if (tool === "create_deal") {
    if (!roleAtLeast(actor.role, "EDITOR")) return { reply: "You need editor access to create deals.", tool };
    const a = payload.args ?? {};
    const dir = /(proc|buy|vendor)/i.test(a.direction ?? "") ? "ORG_BUYING" : "ORG_SELLING";
    const title = (a.title ?? "").trim() || "New deal";
    const counterparty = (a.counterparty ?? "").trim();
    const typeKey = dir === "ORG_BUYING" ? "por" : "sor";
    const type = await prisma.commercialRecordType.findFirst({ where: { key: typeKey }, select: { id: true, prefix: true, key: true, name: true, direction: true, domain: true, isRoot: true } });
    if (!type) return { reply: "Couldn't find the deal type to create.", tool };
    const commercialId = await allocateCommercialId(type.prefix);
    const documentId = await createPlaceholderDocument(title, actor.id, "Created by assistant");
    const vendorEmail = counterparty ? `legal@${counterparty.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example` : "counterparty@example.com";
    const deal = await prisma.deal.create({
      data: {
        commercialId,
        commercialTypeId: type.id,
        recordType: legacyRecordType(type as never),
        title,
        direction: dir,
        documentId,
        ownerId: actor.id,
        vendorEmail,
        vendorName: counterparty || null,
        vendorAccessToken: vendorToken(),
        status: "DRAFT",
      },
    });
    return { reply: `Created ${commercialId} — “${title}”${counterparty ? ` with ${counterparty}` : ""} (draft). Open it to add a contract or send to the counterparty.`, tool, links: [{ href: `/deals/${deal.id}`, label: commercialId }] };
  }

  const dealId = payload.dealId ?? "";
  const d = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, commercialId: true, title: true, status: true } });
  if (!d) return { reply: "That deal no longer exists.", tool };
  if (!(await canAccessDeal(actor, d.id))) return { reply: "You don't have access to that deal.", tool };
  const label = d.commercialId ?? d.title;
  const link = { href: `/deals/${d.id}`, label };

  const open = await prisma.reviewIssue.count({ where: { dealId: d.id, status: "OPEN" } });
  if (open > 0) return { reply: `Can't approve ${label} yet — ${open} open issue${open === 1 ? "" : "s"} must be resolved first.`, tool, links: [link] };

  if (tool === "approve_deal") {
    await prisma.deal.update({ where: { id: d.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    return { reply: `Approved ${label}. You can now start signing.`, tool, links: [link] };
  }
  if (tool === "send_for_signature") {
    if (!["APPROVED", "SIGNING"].includes(d.status)) {
      await prisma.deal.update({ where: { id: d.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    }
    return { reply: `${label} is approved and ready to sign. Open it and use “Start signing” to place fields and send to signers.`, tool, links: [link] };
  }
  return { reply: "Unknown action.", tool };
}

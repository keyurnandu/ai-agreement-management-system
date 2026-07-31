import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { answerAboutPortfolio } from "@/lib/portfolio-qa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const dirParam = url.searchParams.get("direction");
  const direction: "ORG_SELLING" | "ORG_BUYING" = dirParam === "ORG_BUYING" ? "ORG_BUYING" : "ORG_SELLING";

  const body = (await req.json()) as { question?: string; history?: { role: string; content: string }[] };
  const question = body.question?.trim();
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  // Managers/admins see the whole portfolio; others only their own records.
  const ownerId = roleAtLeast(session.user.role, "MANAGER") ? undefined : session.user.id;

  await recordAudit({
    action: "portfolio.ask",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "PORTFOLIO",
    resourceId: direction,
    metadata: { question: question.slice(0, 120) },
  });

  const result = await answerAboutPortfolio(direction, question, ownerId);
  return NextResponse.json(result);
}

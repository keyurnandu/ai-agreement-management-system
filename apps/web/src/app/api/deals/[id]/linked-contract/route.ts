import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { canAccessDeal } from "@/lib/procurement";
import { findContractForDeal, linkDealAndContract } from "@/lib/commercial-link";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const contract = await findContractForDeal(id);
  return NextResponse.json({
    contractId: contract?.id ?? null,
    commercialId: contract?.commercialId ?? null,
    title: contract?.title ?? null,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const actor = { id: session.user.id, role: session.user.role };
  const { id: dealId } = await ctx.params;
  if (!(await canAccessDeal(actor, dealId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { contractId?: string };
  if (!body.contractId) return NextResponse.json({ error: "contractId required" }, { status: 400 });

  const contract = await prisma.contract.findUnique({
    where: { id: body.contractId },
    select: { id: true, createdById: true, dealId: true },
  });
  if (!contract) return NextResponse.json({ error: "contract not found" }, { status: 404 });
  // Must be allowed to take this contract: own it (or be a manager), and it must
  // not already belong to a deal you can't access (prevents stealing a linked contract).
  const canTake = roleAtLeast(actor.role, "MANAGER") || contract.createdById === actor.id;
  if (!canTake) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (contract.dealId && contract.dealId !== dealId && !(await canAccessDeal(actor, contract.dealId))) {
    return NextResponse.json({ error: "that contract is linked to another deal" }, { status: 403 });
  }

  try {
    await linkDealAndContract(dealId, body.contractId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "link failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, contractId: body.contractId });
}

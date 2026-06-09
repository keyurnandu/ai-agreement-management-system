import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { ContractView } from "@/components/ContractView";

export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const c = await prisma.contract.findUnique({ where: { id }, select: { createdById: true } });
  if (!c) notFound();
  if (!(roleAtLeast(session.user.role, "MANAGER") || c.createdById === session.user.id)) notFound();

  return (
    <div className="container">
      <Link href="/contracts" className="muted" style={{ fontSize: 13 }}>
        ← contracts
      </Link>
      <ContractView contractId={id} />
    </div>
  );
}

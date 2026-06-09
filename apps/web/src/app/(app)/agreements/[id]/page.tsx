import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getManageableAgreement } from "@/lib/agreements";
import { AgreementManager } from "@/components/AgreementManager";

export const dynamic = "force-dynamic";

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const actor = { id: session.user.id, role: session.user.role };
  if (!(await getManageableAgreement(actor, id))) notFound();

  return (
    <div className="container">
      <Link href="/agreements" className="muted" style={{ fontSize: 13 }}>
        ← agreements
      </Link>
      <AgreementManager agreementId={id} />
    </div>
  );
}

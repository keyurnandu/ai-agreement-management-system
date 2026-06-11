import { auth } from "@/lib/auth";
import { listAgreementsForDirection, listExtractionDocumentsForDirection } from "@/lib/agreements-list";
import { roleAtLeast } from "@/lib/rbac";
import { AgreementExtractionSection } from "@/components/AgreementExtractionSection";
import { AgreementsPageShell, AgreementsTable } from "@/components/AgreementsPageShell";

export const dynamic = "force-dynamic";

export default async function SalesAgreementsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const user = { id: session.user.id, role: session.user.role };
  const ags = await listAgreementsForDirection("ORG_SELLING", user);
  const docs = await listExtractionDocumentsForDirection("ORG_SELLING", user);
  const canEdit = roleAtLeast(session.user.role, "EDITOR");

  return (
    <AgreementsPageShell
      activeTab="sales"
      title="Agreements"
      subtitle="E-sign for customer deals — signing pipeline and document attribute extraction."
      extraction={<AgreementExtractionSection rows={docs} canEdit={canEdit} />}
    >
      <AgreementsTable
        rows={ags.map((a) => ({
          id: a.id,
          title: a.title,
          status: a.status,
          routingType: a.routingType,
          updatedAt: a.updatedAt,
          signed: a.recipients.filter((r) => r.status === "SIGNED").length,
          signers: a.recipients.filter((r) => r.role !== "CC").length,
        }))}
      />
    </AgreementsPageShell>
  );
}

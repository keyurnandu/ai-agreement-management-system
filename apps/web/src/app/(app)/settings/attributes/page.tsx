import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { AttributesAdmin } from "@/components/AttributesAdmin";

export const dynamic = "force-dynamic";

export default async function AttributesSettingsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canManage = roleAtLeast(session.user.role, "EDITOR");

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Document attributes</h2>
      <p className="lead">
        Define fields the AI extracts from PDFs — effective date, contract value, parties, renewal terms, or anything
        custom. On a document, open the <strong>Attributes</strong> panel → <strong>Run all</strong> to extract, and{" "}
        <strong>Show / hide</strong> to choose what you see per document.
      </p>
      {!canManage ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Sign in as Editor or above to create and edit attribute definitions.
        </p>
      ) : null}
      <AttributesAdmin canManage={canManage} />
    </>
  );
}

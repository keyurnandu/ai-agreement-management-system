import Link from "next/link";
import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { AttributesAdmin } from "@/components/AttributesAdmin";

export const dynamic = "force-dynamic";

export default async function AttributesPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canManage = roleAtLeast(session.user.role, "MANAGER");

  return (
    <div className="container">
      <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
        ← dashboard
      </Link>
      <h1 style={{ marginTop: 6 }}>All attributes</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Define the data that matters to your team and the AI will extract it across your documents (run it from a
        document&apos;s <strong>Attributes</strong> panel).{canManage ? "" : " (Read-only — manager access required to edit.)"}
      </p>
      <AttributesAdmin canManage={canManage} />
    </div>
  );
}

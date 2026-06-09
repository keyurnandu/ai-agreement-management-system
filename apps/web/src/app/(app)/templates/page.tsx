import Link from "next/link";
import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { TemplateAdmin } from "@/components/TemplateAdmin";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canManage = roleAtLeast(session.user.role, "MANAGER");

  return (
    <div className="container">
      <Link href="/contracts" className="muted" style={{ fontSize: 13 }}>
        ← contracts
      </Link>
      <h1 style={{ marginTop: 6 }}>Templates</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Assemble templates from clause-library entries, with variables. Active templates appear in{" "}
        <strong>New contract</strong>.{canManage ? "" : " (Read-only — manager access required to edit.)"}
      </p>
      <TemplateAdmin canManage={canManage} />
    </div>
  );
}

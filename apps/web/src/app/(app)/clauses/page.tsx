import Link from "next/link";
import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { ClauseAdmin } from "@/components/ClauseAdmin";

export const dynamic = "force-dynamic";

export default async function ClausesPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canManage = roleAtLeast(session.user.role, "MANAGER");

  return (
    <div className="container">
      <Link href="/contracts" className="muted" style={{ fontSize: 13 }}>
        ← contracts
      </Link>
      <h1 style={{ marginTop: 6 }}>Clause library</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Standard clause language with approved fallbacks. Templates assemble from these; authored contracts can swap to a
        fallback or deviate (tracked).
        {canManage ? "" : " (Read-only — manager access required to edit.)"}
      </p>
      <ClauseAdmin canManage={canManage} />
    </div>
  );
}

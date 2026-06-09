import Link from "next/link";
import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { DeveloperPanel } from "@/components/DeveloperPanel";

export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canManage = roleAtLeast(session.user.role, "MANAGER");

  return (
    <div className="container">
      <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
        ← dashboard
      </Link>
      <h1 style={{ marginTop: 6 }}>Developer</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        External API access — issue API keys with scopes and register webhooks. The versioned API lives at{" "}
        <code>/api/v1</code>.
      </p>
      {canManage ? (
        <DeveloperPanel />
      ) : (
        <div className="card">
          <p className="muted">Manager access required to manage API keys and webhooks.</p>
        </div>
      )}
    </div>
  );
}

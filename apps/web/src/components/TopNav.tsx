import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export async function TopNav() {
  const session = await auth();

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <nav className="nav">
      <Link href="/dashboard" className="brand" style={{ fontSize: 16 }}>
        contract-platform
      </Link>
      <div className="links">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/documents">Documents</Link>
        <Link href="/attributes">Attributes</Link>
        <Link href="/contracts">Contracts</Link>
        <Link href="/agreements">Agreements</Link>
        <Link href="/analytics">Analytics</Link>
      </div>
      <div className="spacer" />
      {session?.user ? (
        <>
          <span className="muted" style={{ fontSize: 13 }}>
            {session.user.email} · <strong>{session.user.role}</strong>
          </span>
          <form action={doSignOut}>
            <button className="btn secondary" type="submit" style={{ padding: "6px 12px" }}>
              Sign out
            </button>
          </form>
        </>
      ) : null}
    </nav>
  );
}

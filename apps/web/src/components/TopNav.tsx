import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { NavLinks } from "@/components/NavLinks";

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
      <NavLinks />
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

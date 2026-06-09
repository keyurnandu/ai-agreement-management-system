import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { getAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Managers+ see org-wide; everyone else sees their own.
  const ownerId = roleAtLeast(session.user.role, "MANAGER") ? undefined : session.user.id;
  return NextResponse.json(await getAnalytics(ownerId));
}

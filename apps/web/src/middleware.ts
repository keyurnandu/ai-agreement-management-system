import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

// Edge-safe NextAuth instance (no Prisma) — only runs the `authorized` gate.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};

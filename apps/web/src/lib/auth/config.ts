import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config. Contains ONLY things that can run in the middleware
 * (no Prisma, no Node APIs). The actual providers (which touch the DB) are added
 * in ./index.ts. The `authorized` callback gates every matched route.
 */
// Public (unauthenticated) areas. The signing ceremony is token-gated, not session-gated.
// /api/v1 is the external API (API-key auth, enforced per-route) — not session-gated.
const PUBLIC_PREFIXES = ["/login", "/api/health", "/api/auth", "/sign", "/api/sign", "/api/v1"];

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic = PUBLIC_PREFIXES.some((p) => nextUrl.pathname.startsWith(p));
      if (isPublic) return true;
      return isLoggedIn; // false -> NextAuth redirects to the signIn page
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? "VIEWER";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  providers: [], // populated in ./index.ts
} satisfies NextAuthConfig;

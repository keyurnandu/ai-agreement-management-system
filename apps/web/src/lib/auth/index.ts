import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./config";
import { verifyPassword } from "./password";
import { prisma } from "@/lib/db";
import { env } from "@/env";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const credentialsProvider = Credentials({
  credentials: { email: {}, password: {} },
  async authorize(raw) {
    const parsed = credentialsSchema.safeParse(raw);
    if (!parsed.success) return null;

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !user.passwordHash) return null;

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
    };
  },
});

/**
 * AUTH_PROVIDER selects the strategy. Credentials (local accounts) today.
 * To enable SSO later, set AUTH_PROVIDER=oidc and add an OIDC provider here, e.g.:
 *
 *   import type { OIDCConfig } from "next-auth/providers";
 *   const oidc = { id: "sso", name: "SSO", type: "oidc",
 *     issuer: env.OIDC_ISSUER, clientId: env.OIDC_CLIENT_ID,
 *     clientSecret: env.OIDC_CLIENT_SECRET } satisfies OIDCConfig<Record<string, unknown>>;
 *   providers.push(oidc);
 *
 * No other code changes — the session shape is identical.
 */
const providers = [credentialsProvider];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  providers,
});

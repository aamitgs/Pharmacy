import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { basePrisma, prisma, tenantContext } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/totp";

/**
 * Login looks a user up by email before any tenant is known — the one
 * legitimate case for reading across all tenants. Uses the unextended base
 * client with the `app.rls_bypass` escape hatch scoped to a single batched
 * transaction, never left set on the connection afterwards.
 */
async function findUserForLogin(email: string) {
  const [, user] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.user.findFirst({ where: { email }, include: { tenant: { select: { suspendedAt: true } } } }),
  ]);
  return user;
}

const MFA_REQUIRED_ROLES = ["owner", "pharmacist"] as const;

// signIn() with redirect:false surfaces this as `code`, not `error` (which
// stays the fixed "CredentialsSignin" string) — see @auth/core/errors.js.
class MfaRequiredError extends CredentialsSignin {
  code = "MFA_REQUIRED";
}
class InvalidTotpError extends CredentialsSignin {
  code = "INVALID_TOTP";
}
class TenantSuspendedError extends CredentialsSignin {
  code = "TENANT_SUSPENDED";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totpCode: {},
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        const totpCode = credentials?.totpCode ? String(credentials.totpCode) : undefined;

        if (!email || !password) return null;

        const user = await findUserForLogin(email);
        if (!user) return null;

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) return null;

        if (user.tenant.suspendedAt) {
          throw new TenantSuspendedError();
        }

        if (user.totpEnabled && user.totpSecret) {
          if (!totpCode) {
            throw new MfaRequiredError();
          }
          const codeValid = verifyTotpCode(user.totpSecret, totpCode);
          if (!codeValid) {
            throw new InvalidTotpError();
          }
        }

        const mfaSetupRequired =
          !user.totpEnabled &&
          MFA_REQUIRED_ROLES.includes(user.role as (typeof MFA_REQUIRED_ROLES)[number]);

        return {
          id: user.id,
          tenantId: user.tenantId,
          role: user.role,
          name: user.name,
          email: user.email,
          mfaSetupRequired,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.mfaSetupRequired = user.mfaSetupRequired;
      }
      // Refresh the mfaSetupRequired flag after the user finishes MFA setup.
      if (trigger === "update" && token.id) {
        // Must await *inside* the run() callback, not just return the
        // (lazy, unstarted) PrismaPromise — Prisma defers the actual query
        // dispatch until `.then()` is called, and if that happens outside
        // run()'s synchronous scope the AsyncLocalStorage context is gone.
        const dbUser = await tenantContext.run({ tenantId: token.tenantId as string }, async () => {
          return await prisma.user.findUnique({ where: { id: token.id as string } });
        });
        if (dbUser) {
          token.mfaSetupRequired =
            !dbUser.totpEnabled &&
            MFA_REQUIRED_ROLES.includes(dbUser.role as (typeof MFA_REQUIRED_ROLES)[number]);
        }
      }
      return token;
    },
  },
});

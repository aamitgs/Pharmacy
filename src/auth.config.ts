import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe config used by middleware. Must not import Prisma or bcrypt —
 * middleware runs on the Edge runtime and only needs to read the JWT.
 * The real Credentials provider (with DB access) lives in `src/auth.ts`.
 */
export const authConfig = {
  // Required for self-hosted deployments (this app only ships as
  // self-hosted Docker, never Vercel): Auth.js only trusts the incoming
  // Host header automatically when it can detect a Vercel deployment.
  // Everywhere else — including `next start` in this repo's own Docker
  // image — auth silently 500s on every request without this, which only
  // shows up in production/standalone mode, never in `next dev`. The
  // operator is expected to terminate TLS and set NEXTAUTH_URL correctly
  // in front of this (see README).
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Idle-timeout approximation: the cookie's lifetime is the idle window,
    // and it's re-issued (sliding) whenever `updateAge` has elapsed since
    // the last request that touched the session.
    maxAge: Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? 15) * 60,
    updateAge: 60,
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const pathname = request.nextUrl.pathname;

      const isPublic =
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks");
      if (isPublic) return true;
      if (!isLoggedIn) return false;

      const mfaSetupRequired = auth.user.mfaSetupRequired;
      const onMfaSetup = pathname.startsWith("/mfa-setup");
      if (mfaSetupRequired && !onMfaSetup) {
        return Response.redirect(new URL("/mfa-setup", request.nextUrl));
      }
      if (!mfaSetupRequired && onMfaSetup) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
    // Pure (no DB/bcrypt) so it's safe to run on the Edge in middleware too.
    // Copies the custom JWT claims set in src/auth.ts's `jwt` callback onto
    // `session.user` — without this, middleware can't see role/tenantId/
    // mfaSetupRequired and the `authorized` callback above would misfire.
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.tenantId = token.tenantId as string;
      session.user.role = token.role;
      session.user.mfaSetupRequired = token.mfaSetupRequired as boolean;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

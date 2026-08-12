import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe config used by middleware. Must not import Prisma or bcrypt —
 * middleware runs on the Edge runtime and only needs to read the JWT.
 * The real Credentials provider (with DB access) lives in `src/auth.ts`.
 */
export const authConfig = {
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

      const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api/auth");
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
  },
  providers: [],
} satisfies NextAuthConfig;

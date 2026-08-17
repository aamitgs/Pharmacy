import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  // /api/backup/scheduled, /api/refill-reminders/scheduled, and
  // /api/push/scheduled authenticate themselves via a shared-secret header
  // (they're meant to be hit by an external cron, not a logged-in browser
  // session) so all three are excluded here rather than threaded through
  // the session-based `authorized` callback. manifest.webmanifest, sw.js,
  // and icons/* (Phase 9.2, the owner PWA) must also be reachable
  // pre-login — a browser fetches these to decide installability and to
  // register the service worker before any auth state exists, same reason
  // favicon.ico is already excluded.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|api/backup/scheduled|api/refill-reminders/scheduled|api/push/scheduled).*)",
  ],
};

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  // /api/backup/scheduled and /api/refill-reminders/scheduled authenticate
  // themselves via a shared-secret header (they're meant to be hit by an
  // external cron, not a logged-in browser session) so both are excluded
  // here rather than threaded through the session-based `authorized`
  // callback.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/backup/scheduled|api/refill-reminders/scheduled).*)"],
};

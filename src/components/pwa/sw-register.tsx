"use client";

import { useEffect } from "react";

/** Mounted once in AppShell — registers the owner PWA service worker for every signed-in role. Push *subscription* itself is a separate, owner-only opt-in (Settings > Notifications), this just makes the app installable and gives the owner-relevant screens an offline app-shell. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

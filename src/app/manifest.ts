import type { MetadataRoute } from "next";

// Static, platform-level manifest — deliberately not per-tenant. A tenant's
// own branding (logo/color) already shows inside the app itself (header,
// portal); the installed-app identity here is the platform's, same as any
// multi-tenant SaaS PWA (e.g. Slack's own app icon isn't reskinned per
// workspace).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pharmacy Billing",
    short_name: "Pharmacy",
    description: "Owner dashboard, alerts, analytics & indent approvals",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

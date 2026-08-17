"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getPushPublicKey,
  getPushSubscriptionStatus,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPushNotification,
} from "@/lib/actions/push";
import { toast } from "sonner";
import { Bell, BellOff, Loader2, Send } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationsPanel() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();

  useEffect(() => {
    Promise.all([getPushPublicKey(), getPushSubscriptionStatus()]).then(([key, status]) => {
      setConfigured(key.configured);
      setPublicKey(key.publicKey);
      setSubscribed(status.subscribed);
      setLoading(false);
    });
  }, []);

  function enable() {
    startTransition(async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          throw new Error("Push notifications aren't supported in this browser.");
        }
        if (!publicKey) throw new Error("Push is not configured on the server.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification permission was denied.");

        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
        await subscribeToPush(sub.toJSON());
        setSubscribed(true);
        toast.success("Push notifications enabled on this device.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not enable push notifications.");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const sub = await registration?.pushManager.getSubscription();
        if (sub) {
          await unsubscribeFromPush(sub.endpoint);
          await sub.unsubscribe();
        }
        setSubscribed(false);
        toast.success("Push notifications disabled on this device.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not disable push notifications.");
      }
    });
  }

  function sendTest() {
    startTest(async () => {
      const result = await sendTestPushNotification();
      if (result.sent > 0) toast.success("Test notification sent.");
      else toast.error("No active subscription received it — try re-enabling.");
    });
  }

  if (loading) return null;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Push notifications</h2>
        <p className="text-sm text-muted-foreground">
          Install this app on your phone (Add to Home Screen) and get a push notification here for
          low stock, license renewals due, and indent requests waiting on your approval — no need to
          have the app open.
        </p>
      </div>

      {!configured ? (
        <Alert>
          <BellOff className="h-4 w-4" />
          <AlertDescription>
            Push notifications are not configured for this deployment — set VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY, and VAPID_SUBJECT (see README).
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {subscribed ? "Enabled on this device" : "Not enabled on this device"}
            </p>
            <p className="text-xs text-muted-foreground">
              Each device (phone, desktop browser) is subscribed separately.
            </p>
          </div>
          {subscribed ? (
            <Button variant="outline" onClick={disable} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
              Disable
            </Button>
          ) : (
            <Button onClick={enable} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Enable on this device
            </Button>
          )}
        </div>
      )}

      {configured && subscribed && (
        <Button variant="outline" onClick={sendTest} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send test notification
        </Button>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Scheduled digest (self-hosted)</p>
        <p className="mt-1">
          For an automatic daily summary push (low stock, license renewals, pending indents), point
          an OS-level cron at <code>POST /api/push/scheduled</code> with header{" "}
          <code>x-push-notifications-secret: $PUSH_NOTIFICATIONS_CRON_SECRET</code>. Pending indent
          requests also send an immediate push the moment they&apos;re submitted, independent of
          this schedule.
        </p>
      </div>
    </div>
  );
}

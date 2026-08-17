import "server-only";
import { logWarn } from "@/lib/logger";

// Provider: Gupshup (https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation)
// chosen for its well-documented REST API and low setup friction for a
// small pharmacy tenant. To go live: create a Gupshup account, provision a
// WhatsApp Business sender number, and set GUPSHUP_API_KEY,
// GUPSHUP_SOURCE_NUMBER, and GUPSHUP_APP_NAME (see README). Without those
// env vars this always returns { success: false, note: "not configured" }
// — callers must treat that as a normal, expected outcome, not an error to
// surface as a crash, since a pharmacy may simply not have set this up yet.

export interface WhatsAppMessage {
  to: string;
  text: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  note?: string;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const apiKey = process.env.GUPSHUP_API_KEY;
  const source = process.env.GUPSHUP_SOURCE_NUMBER;
  const appName = process.env.GUPSHUP_APP_NAME;

  if (!apiKey || !source || !appName) {
    return {
      success: false,
      note: "WhatsApp is not configured for this pharmacy — set GUPSHUP_API_KEY, GUPSHUP_SOURCE_NUMBER, and GUPSHUP_APP_NAME to enable sending.",
    };
  }

  try {
    const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
      body: new URLSearchParams({
        channel: "whatsapp",
        source,
        destination: normalizePhone(message.to),
        "src.name": appName,
        message: JSON.stringify({ type: "text", text: message.text }),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const note = `Gupshup API error ${res.status}: ${body.slice(0, 200)}`;
      logWarn(note, { action: "whatsapp.send", status: String(res.status) });
      return { success: false, note };
    }
    return { success: true };
  } catch (e) {
    const note = e instanceof Error ? `Send failed: ${e.message}` : "Send failed: unknown error";
    logWarn(note, { action: "whatsapp.send" });
    return { success: false, note };
  }
}

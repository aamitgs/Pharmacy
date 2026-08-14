"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, ExternalLink, Loader2, Lock, Trash2 } from "lucide-react";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function ApiPanel({ initial }: { initial: { publicApiAccess: boolean; keys: ApiKeyRow[] } }) {
  const [keys, setKeys] = useState(initial.keys);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        const result = await createApiKeyAction({ name });
        setNewKey(result.plaintext);
        setName("");
        // Optimistic row — the real prefix/id come back on next page load,
        // this just avoids the list looking stale immediately after creating.
        setKeys((k) => [
          { id: `pending-${Date.now()}`, name, keyPrefix: result.plaintext.slice(0, 10), lastUsedAt: null, createdAt: new Date() },
          ...k,
        ]);
        toast.success("API key created — copy it now, it won't be shown again");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create key");
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeApiKeyAction(id);
        setKeys((k) => k.filter((row) => row.id !== id));
        toast.success("Key revoked");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not revoke key");
      }
    });
  }

  if (!initial.publicApiAccess) {
    return (
      <Alert className="max-w-2xl">
        <Lock className="h-4 w-4" />
        <AlertDescription>
          The public API requires the Premium plan or above — upgrade in Settings &gt; Billing.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Read-only access to invoices, stock, and customers, plus a narrow create-sale endpoint —{" "}
          <a href="/api/v1/openapi" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
            OpenAPI spec <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {newKey && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p className="font-medium">Copy this key now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{newKey}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Input placeholder="Key name, e.g. Storefront integration" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button size="sm" disabled={pending || !name.trim()} onClick={create}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Generate key
        </Button>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs">{k.keyPrefix}…</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {k.lastUsedAt ? format(k.lastUsedAt, "dd MMM yyyy HH:mm") : "Never"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(k.createdAt, "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => revoke(k.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                  No API keys yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

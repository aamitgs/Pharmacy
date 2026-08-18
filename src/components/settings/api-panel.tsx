"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { API_SCOPES, API_SCOPE_LABELS, isWriteScope, type ApiScope } from "@/lib/api-scopes";
import { AlertTriangle, Copy, ExternalLink, Loader2, Lock, Trash2 } from "lucide-react";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  fullAccess: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function ApiPanel({ initial }: { initial: { publicApiAccess: boolean; keys: ApiKeyRow[] } }) {
  const [keys, setKeys] = useState(initial.keys);
  const [name, setName] = useState("");
  // Starts empty on purpose — an owner picks what the key may do rather than
  // unticking things off a full-access default.
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        const result = await createApiKeyAction({ name, scopes });
        setNewKey(result.plaintext);
        setName("");
        setScopes([]);
        // Optimistic row — the real prefix/id come back on next page load,
        // this just avoids the list looking stale immediately after creating.
        setKeys((k) => [
          {
            id: `pending-${Date.now()}`,
            name,
            keyPrefix: result.plaintext.slice(0, 10),
            scopes,
            fullAccess: scopes.length === API_SCOPES.length,
            lastUsedAt: null,
            createdAt: new Date(),
          },
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
          Each key carries only the scopes you choose below, so a key that leaks can do no more
          than the job it was issued for —{" "}
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

      <div className="space-y-3 rounded-lg border p-3">
        <Input
          placeholder="Key name, e.g. Storefront integration"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <div className="space-y-2">
          <p className="text-xs font-medium">What may this key do?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {API_SCOPES.map((scope) => (
              <div key={scope} className="flex items-start gap-2">
                <Checkbox
                  id={`scope-${scope}`}
                  checked={scopes.includes(scope)}
                  disabled={pending}
                  onCheckedChange={(checked) =>
                    setScopes((current) =>
                      checked ? [...current, scope] : current.filter((s) => s !== scope)
                    )
                  }
                />
                <Label htmlFor={`scope-${scope}`} className="text-xs leading-tight font-normal">
                  {API_SCOPE_LABELS[scope]}
                  {isWriteScope(scope) && (
                    <Badge variant="outline" className="ml-1 text-[9px] text-warning">
                      writes
                    </Badge>
                  )}
                  <span className="block font-mono text-[10px] text-muted-foreground">{scope}</span>
                </Label>
              </div>
            ))}
          </div>
        </div>
        <Button size="sm" disabled={pending || !name.trim() || scopes.length === 0} onClick={create}>
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
              <TableHead>Scopes</TableHead>
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
                <TableCell className="max-w-[16rem]">
                  {k.fullAccess ? (
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Full access — reissue narrower
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {k.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="font-mono text-[9px]">
                          {scope}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TableCell>
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
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
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

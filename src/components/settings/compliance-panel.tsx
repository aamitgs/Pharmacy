"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updateLicenseExpiryWindow } from "@/lib/actions/branch-settings";
import { createGstFilingReminder, deleteGstFilingReminder } from "@/lib/actions/gst-reminders";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";

interface GstReminder {
  id: string;
  label: string;
  dueDate: Date;
  leadDays: number;
}

export function CompliancePanel({
  initial,
  initialGstReminders,
}: {
  initial: { licenseExpiryWindowDays: number };
  initialGstReminders: GstReminder[];
}) {
  const [windowDays, setWindowDays] = useState(String(initial.licenseExpiryWindowDays));
  const [pending, startTransition] = useTransition();

  const [reminders, setReminders] = useState(initialGstReminders);
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [leadDays, setLeadDays] = useState("7");
  const [addPending, startAddTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function addReminder() {
    if (!label.trim() || !dueDate) {
      toast.error("Enter a label and a due date.");
      return;
    }
    startAddTransition(async () => {
      try {
        const created = await createGstFilingReminder({
          label: label.trim(),
          dueDate: new Date(dueDate),
          leadDays: Number(leadDays) || 7,
        });
        setReminders((r) => [...r, created].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()));
        setLabel("");
        setDueDate("");
        setLeadDays("7");
        toast.success("Reminder added");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add reminder");
      }
    });
  }

  function removeReminder(id: string) {
    setDeletingId(id);
    startDeleteTransition(async () => {
      try {
        await deleteGstFilingReminder(id);
        setReminders((r) => r.filter((x) => x.id !== id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove reminder");
      } finally {
        setDeletingId(null);
      }
    });
  }

  function submit() {
    startTransition(async () => {
      try {
        await updateLicenseExpiryWindow({ licenseExpiryWindowDays: Number(windowDays) || 60 });
        toast.success("Saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save changes");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-sm font-medium">License renewal warning window</h2>
        <p className="text-sm text-muted-foreground">
          Licenses expiring within this many days appear on Alerts and the dashboard. Applies across all
          branches.
        </p>
      </div>

      <div className="space-y-1.5 max-w-xs">
        <Label htmlFor="expiryWindow">Days</Label>
        <Input
          id="expiryWindow"
          type="number"
          min={1}
          value={windowDays}
          onChange={(e) => setWindowDays(e.target.value)}
        />
      </div>

      <Button disabled={pending} onClick={submit}>
        Save
      </Button>

      <div className="border-t pt-4">
        <Link href="/branches" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Manage branch license numbers &amp; expiry dates <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="space-y-4 border-t pt-4">
        <div>
          <h2 className="text-sm font-medium">GST filing reminders</h2>
          <p className="text-sm text-muted-foreground">
            Add the filing date(s) that matter to your pharmacy — filing cadence and jurisdiction
            specifics vary too much for this to guess for you. Each one starts showing on the
            dashboard and Alerts the number of days before its due date that you set below.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="gstLabel">Label</Label>
            <Input
              id="gstLabel"
              placeholder="e.g. GSTR-3B — Sep"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gstDueDate">Due date</Label>
            <Input id="gstDueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gstLeadDays">Remind (days before)</Label>
            <Input
              id="gstLeadDays"
              type="number"
              min={0}
              max={90}
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" disabled={addPending} onClick={addReminder}>
          {addPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Add reminder
        </Button>

        {reminders.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Remind (days before)</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminders.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell>{format(r.dueDate, "dd MMM yyyy")}</TableCell>
                  <TableCell>{r.leadDays}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={deletePending && deletingId === r.id}
                      onClick={() => removeReminder(r.id)}
                      aria-label={`Remove ${r.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

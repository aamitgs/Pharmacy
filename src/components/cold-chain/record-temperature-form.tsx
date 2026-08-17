"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordTemperatureLog } from "@/lib/actions/temperature-logs";
import { Loader2, Thermometer } from "lucide-react";

export function RecordTemperatureForm() {
  const router = useRouter();
  const [temperature, setTemperature] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !temperature.trim()) return;
    startTransition(async () => {
      try {
        const result = await recordTemperatureLog({
          temperatureCelsius: Number(temperature),
          note: note.trim() || undefined,
        });
        if (result.outOfRange) {
          toast.warning("Reading recorded — out of the 2–8°C range.");
        } else {
          toast.success("Temperature reading recorded.");
        }
        setTemperature("");
        setNote("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not record reading");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="temperature">Temperature (°C)</Label>
        <Input
          id="temperature"
          type="number"
          step="0.1"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          className="w-32"
          required
          autoFocus
        />
      </div>
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={1} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Thermometer className="h-4 w-4" />}
        Record reading
      </Button>
    </form>
  );
}

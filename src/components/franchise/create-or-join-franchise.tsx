"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createFranchiseGroup, joinFranchiseGroup } from "@/lib/actions/franchise";
import { Loader2 } from "lucide-react";

export function CreateOrJoinFranchise() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, startCreate] = useTransition();
  const [joining, startJoin] = useTransition();

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating || !name.trim()) return;
    startCreate(async () => {
      try {
        await createFranchiseGroup({ name: name.trim() });
        toast.success("Franchise group created");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create group");
      }
    });
  }

  function submitJoin(e: React.FormEvent) {
    e.preventDefault();
    if (joining || !joinCode.trim()) return;
    startJoin(async () => {
      try {
        const result = await joinFranchiseGroup({ joinCode: joinCode.trim() });
        toast.success(`Joined ${result.groupName}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not join group");
      }
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a franchise group</CardTitle>
          <CardDescription>
            Link other independent pharmacies to yours without merging any data — you&apos;ll get an
            opt-in sales rollup from members and can push a standardized item list to them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCreate} className="flex gap-2">
            <Input
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creating}
            />
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Join a franchise group</CardTitle>
          <CardDescription>
            Enter the join code your franchisor shared with you. Your data stays fully separate —
            joining only lets you optionally share sales totals and receive a standardized item
            list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitJoin} className="flex gap-2">
            <Input
              placeholder="Join code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              disabled={joining}
              className="font-mono uppercase"
            />
            <Button type="submit" variant="outline" disabled={joining}>
              {joining && <Loader2 className="h-4 w-4 animate-spin" />}
              Join
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

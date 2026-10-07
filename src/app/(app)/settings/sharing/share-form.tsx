"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shareAction, type FormState } from "./actions";

export function ShareForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(shareAction, { ok: false });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="sh-email">Share with (must already be invited)</Label>
        <Input id="sh-email" name="email" type="email" required placeholder="partner@example.com" />
      </div>
      <label className="flex items-end gap-2 pb-2 text-xs text-muted-foreground">
        <input type="checkbox" name="includeTransactions" className="size-3.5" /> Include transaction history
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>{pending ? "Sharing…" : "Share read-only"}</Button>
        {state.message && <span className={state.ok ? "text-xs text-positive" : "text-xs text-destructive"}>{state.message}</span>}
      </div>
    </form>
  );
}

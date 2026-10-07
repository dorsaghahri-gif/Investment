"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runPriceRefreshAction, type RunState } from "./actions";

export function RunRefreshButton() {
  const [state, action, pending] = useActionState<RunState>(runPriceRefreshAction, { ok: false });
  return (
    <form action={action} className="flex items-center gap-3">
      {state.message && <span className={state.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{state.message}</span>}
      <Button size="sm" variant="outline" disabled={pending}>
        <RefreshCw className={pending ? "animate-spin" : ""} />
        {pending ? "Refreshing…" : "Refresh prices now"}
      </Button>
    </form>
  );
}

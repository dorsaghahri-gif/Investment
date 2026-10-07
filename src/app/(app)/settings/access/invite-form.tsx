"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { inviteAction, type FormState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteAction, { ok: false });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="inv-email">Email</Label>
        <Input id="inv-email" name="email" type="email" required placeholder="friend@example.com" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="inv-name">Name (optional)</Label>
        <Input id="inv-name" name="displayName" maxLength={80} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="inv-role">Role</Label>
        <NativeSelect id="inv-role" name="role" defaultValue="member">
          <option value="member">Member — own private portfolio</option>
          <option value="owner">Owner — can manage access &amp; Data Health</option>
        </NativeSelect>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2">
        <input type="checkbox" name="sendEmail" className="mt-0.5 size-3.5" />
        <span>
          Also send a Supabase invite email. Requires custom SMTP and the updated Invite template (see README). Without it, just
          send them the app link; they sign in with their email on the login page.
        </span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 sm:justify-end">
        {state.message && <span className={state.ok ? "text-xs text-positive" : "text-xs text-destructive"}>{state.message}</span>}
        <Button type="submit" disabled={pending}>{pending ? "Inviting…" : "Invite"}</Button>
      </div>
    </form>
  );
}

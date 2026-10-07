"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import {
  addHoldingAction,
  commitImportAction,
  createAccountAction,
  previewImportAction,
  updateCashAction,
  type ActionState,
  type PreviewState,
} from "./actions";

type Account = { id: string; name: string; tracking_mode: "positions" | "transactions" };

function Msg({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <p className={state.ok ? "text-xs text-positive" : "text-xs text-destructive"} role="status">{state.message}</p>;
}
function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="text-[11px] text-destructive">{errors[0]}</p> : null;
}

export function CreateAccountForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAccountAction, { ok: false });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="acct-name">Account name</Label>
        <Input id="acct-name" name="name" required maxLength={80} placeholder="Fidelity Brokerage" />
        <FieldError errors={state.fieldErrors?.name} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="acct-inst">Institution</Label>
        <Input id="acct-inst" name="institution" maxLength={80} placeholder="Fidelity" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="acct-type">Type</Label>
        <NativeSelect id="acct-type" name="accountType" defaultValue="taxable">
          <option value="taxable">Taxable</option>
          <option value="ira_traditional">Traditional IRA</option>
          <option value="ira_roth">Roth IRA</option>
          <option value="401k">401(k)</option>
          <option value="hsa">HSA</option>
          <option value="other">Other</option>
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="acct-mode">Holdings come from</Label>
        <NativeSelect id="acct-mode" name="trackingMode" defaultValue="positions">
          <option value="positions">Positions I enter / import</option>
          <option value="transactions">Transaction history (derived)</option>
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="acct-cash">Cash balance (USD)</Label>
        <Input id="acct-cash" name="cashBalance" inputMode="decimal" placeholder="0.00" />
        <FieldError errors={state.fieldErrors?.cashBalance} />
      </div>
      <div className="flex items-end gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function CashForm({ accountId, cash }: { accountId: string; cash: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCashAction, { ok: false });
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <Input name="cashBalance" defaultValue={cash.toFixed(2)} inputMode="decimal" className="h-7 w-32 text-xs" aria-label="Cash balance" />
      <Button size="xs" variant="outline" disabled={pending}>Save</Button>
      <Msg state={state} />
    </form>
  );
}

export function AddHoldingForm({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addHoldingAction, { ok: false });
  const positionAccounts = accounts.filter((a) => a.tracking_mode === "positions");
  if (!positionAccounts.length) return <p className="text-sm text-muted-foreground">Create an account with “Positions I enter / import” to add holdings manually.</p>;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-5">
      <div className="space-y-1 sm:col-span-1">
        <Label htmlFor="h-acct">Account</Label>
        <NativeSelect id="h-acct" name="accountId">
          {positionAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="h-sym">Symbol</Label>
        <Input id="h-sym" name="symbol" required maxLength={15} placeholder="NVDA" className="uppercase" />
        <FieldError errors={state.fieldErrors?.symbol} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="h-qty">Quantity</Label>
        <Input id="h-qty" name="quantity" required inputMode="decimal" placeholder="10" />
        <FieldError errors={state.fieldErrors?.quantity} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="h-cost">Total cost basis (optional)</Label>
        <Input id="h-cost" name="costBasisTotal" inputMode="decimal" placeholder="Unknown" />
        <FieldError errors={state.fieldErrors?.costBasisTotal} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="h-date">Acquired (optional)</Label>
        <Input id="h-date" name="acquiredOn" type="date" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-5">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save position"}</Button>
        <span className="text-[11px] text-muted-foreground">Saving an existing symbol in the same account replaces its quantity and cost.</span>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function ImportPanel({ accounts }: { accounts: Account[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewImportAction, { ok: false });
  const [commit, commitAction, committing] = useActionState<PreviewState, FormData>(commitImportAction, { ok: false });
  const [fileKey, setFileKey] = useState(0);

  if (!accounts.length) return <p className="text-sm text-muted-foreground">Create an account first.</p>;

  return (
    <div className="space-y-4">
      <form ref={formRef} className="grid gap-3 sm:grid-cols-4" action={previewAction}>
        <div className="space-y-1">
          <Label htmlFor="imp-acct">Account</Label>
          <NativeSelect id="imp-acct" name="accountId">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tracking_mode})</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp-kind">File type</Label>
          <NativeSelect id="imp-kind" name="kind" defaultValue="auto">
            <option value="auto">Detect automatically</option>
            <option value="positions">Positions</option>
            <option value="transactions">Transactions</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp-mode">Positions import mode</Label>
          <NativeSelect id="imp-mode" name="mode" defaultValue="replace">
            <option value="replace">Replace account holdings</option>
            <option value="merge">Merge (update listed symbols only)</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp-file">CSV file (max 2 MB)</Label>
          <Input key={fileKey} id="imp-file" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" variant="outline" disabled={previewing}>{previewing ? "Checking…" : "1. Preview"}</Button>
          <Button
            type="button"
            disabled={!preview.ok || !preview.acceptedCount || committing}
            onClick={() => {
              if (!formRef.current) return;
              const fd = new FormData(formRef.current);
              // commit re-parses the same file server-side; preview results are display-only
              startTransition(() => commitAction(fd));
            }}
          >
            {committing ? "Importing…" : `2. Import ${preview.acceptedCount ?? 0} valid row(s)`}
          </Button>
          {commit.ok && <Button type="button" variant="ghost" onClick={() => setFileKey((k) => k + 1)}>Import another</Button>}
        </div>
      </form>

      {preview.message && !preview.ok && <p className="text-sm text-destructive">{preview.message}</p>}
      {commit.message && <p className={commit.ok ? "text-sm text-positive" : "text-sm text-destructive"}>{commit.message}</p>}
      {commit.result?.derivationIssues.length ? (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-xs">
          <div className="mb-1 font-medium">Ledger issues (holdings may be incomplete):</div>
          <ul className="list-disc pl-4">{commit.result.derivationIssues.slice(0, 20).map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      ) : null}

      {preview.ok && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium">
              <span>Valid rows</span>
              <Badge variant="positive">{preview.acceptedCount} of {preview.totalRows} · {preview.kind}</Badge>
            </div>
            <ul className="max-h-72 overflow-y-auto text-xs">
              {preview.accepted?.map((r) => (
                <li key={r.line} className="border-b px-3 py-1.5 last:border-0">
                  <span className="mr-2 font-mono text-muted-foreground">L{r.line}</span>
                  <span className="num">{r.summary}</span>
                  {r.notes.map((n) => <Badge key={n} variant="secondary" className="ml-2">{n}</Badge>)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium">
              <span>Rejected rows (not imported)</span>
              <Badge variant={preview.errors?.length ? "negative" : "secondary"}>{preview.errors?.length ?? 0}</Badge>
            </div>
            <ul className="max-h-72 overflow-y-auto text-xs">
              {preview.errors?.length ? preview.errors.map((e, i) => (
                <li key={`${e.line}-${i}`} className="border-b px-3 py-1.5 last:border-0">
                  <span className="mr-2 font-mono text-muted-foreground">L{e.line}</span>{e.message}
                </li>
              )) : <li className="px-3 py-2 text-muted-foreground">None</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

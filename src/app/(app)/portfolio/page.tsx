import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listAccounts, listHoldings, listPortfoliosSharedWithMe } from "@/lib/portfolio/repository";
import Link from "next/link";
import { z } from "zod";
import { valuePortfolio } from "@/lib/portfolio/valuation";
import { formatMoney, formatPct, formatQuantity, formatSignedMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataAsOf, ProvenanceTag, Value, toneOf } from "@/components/data/provenance";
import { AddHoldingForm, CashForm, CreateAccountForm, ImportPanel } from "./forms";
import { deleteHoldingAction } from "./actions";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const user = await requireUser();
  const { owner } = await searchParams;
  const shared = await listPortfoliosSharedWithMe(user.email);
  const requested = z.uuid().safeParse(owner);
  const viewing = requested.success && requested.data !== user.id ? shared.find((p) => p.ownerId === requested.data) ?? null : null;
  const ownerId = viewing?.ownerId ?? user.id;
  const readOnly = viewing !== null;
  const [accounts, holdings] = await Promise.all([listAccounts(ownerId), listHoldings(ownerId)]);
  const cash = accounts.reduce((s, a) => s + a.cash_balance, 0);
  const v = valuePortfolio(holdings, cash);
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const nonUsd = v.foreignCurrencySymbols;

  return (
    <>
      <PageHeader
        title={readOnly ? `${viewing!.ownerName ?? viewing!.ownerEmail}'s portfolio` : "Portfolio"}
        description={
          readOnly
            ? "Shared with you · read-only. Values are holdings × latest stored quote."
            : "Accounts, positions and imports. Values are holdings × latest stored quote; unpriced positions are excluded from totals."
        }
        actions={
          shared.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">View:</span>
              <Link href="/portfolio" className={!readOnly ? "font-medium underline" : "text-muted-foreground hover:underline"}>Mine</Link>
              {shared.map((p) => (
                <Link key={p.ownerId} href={`/portfolio?owner=${p.ownerId}`} className={viewing?.ownerId === p.ownerId ? "font-medium underline" : "text-muted-foreground hover:underline"}>
                  {p.ownerName ?? p.ownerEmail}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total value" value={formatMoney(v.totalValue)} kind="calculated" />
        <Stat label="Invested" value={formatMoney(v.investedValue)} kind="calculated" />
        <Stat label="Cash" value={formatMoney(v.cash)} kind="reported" />
        <Stat label="Day change" value={formatSignedMoney(v.dayChange)} tone={toneOf(v.dayChange)} sub={formatPct(v.dayChangePct, { signed: true })} kind="calculated" />
        <Stat label="Unrealized P&L (known cost)" value={formatSignedMoney(v.unrealizedPnlKnown)} tone={toneOf(v.unrealizedPnlKnown)} kind="calculated" />
      </div>
      {(v.unpricedSymbols.length > 0 || v.unknownCostSymbols.length > 0 || nonUsd.length > 0) && (
        <div className="mb-4 space-y-1 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
          {v.unpricedSymbols.length > 0 && <div><b>No price yet:</b> {v.unpricedSymbols.join(", ")} — excluded from totals until the next price refresh.</div>}
          {nonUsd.length > 0 && <div><b>Non-USD positions:</b> {nonUsd.join(", ")} — excluded from totals until FX conversion lands (Phase 2).</div>}
          {v.unknownCostSymbols.length > 0 && <div><b>Unknown cost basis:</b> {v.unknownCostSymbols.join(", ")} — excluded from P&amp;L.</div>}
        </div>
      )}

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Holdings</CardTitle>
          <DataAsOf timestamp={v.oldestQuoteTime} prefix="Oldest quote" />
        </CardHeader>
        <CardContent className="px-0">
          {holdings.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">No holdings yet. Add a position or import a CSV below.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Symbol</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Day</TableHead>
                  <TableHead className="text-right">Market value</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Cost basis</TableHead>
                  <TableHead className="text-right">Unrealized</TableHead>
                  <TableHead>Quote</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.holdings.map((h) => {
                  const row = byId.get(h.id)!;
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="pl-4">
                        <div className="font-medium">{h.symbol}</div>
                        <div className="max-w-48 truncate text-[11px] text-muted-foreground">{row.name ?? "Profile pending"}</div>
                      </TableCell>
                      <TableCell className="text-xs">{row.accountName} <Badge variant="outline" className="ml-1">{row.source}</Badge></TableCell>
                      <TableCell className="text-right">{formatQuantity(h.quantity)}</TableCell>
                      <TableCell className="text-right"><Value text={formatMoney(h.price)} /></TableCell>
                      <TableCell className="text-right"><Value text={formatPct(h.changePct, { signed: true })} tone={toneOf(h.changePct)} /></TableCell>
                      <TableCell className="text-right"><Value text={formatMoney(h.marketValue)} /></TableCell>
                      <TableCell className="text-right"><Value text={formatPct(h.weight, { decimals: 1 })} /></TableCell>
                      <TableCell className="text-right"><Value text={formatMoney(h.costBasisTotal)} /></TableCell>
                      <TableCell className="text-right">
                        <Value text={formatSignedMoney(h.unrealizedPnl)} tone={toneOf(h.unrealizedPnl)} />
                        <div className="text-[11px]"><Value text={formatPct(h.unrealizedPct, { signed: true })} tone={toneOf(h.unrealizedPct)} /></div>
                      </TableCell>
                      <TableCell><DataAsOf timestamp={h.quoteTime} provider={row.quoteProvider} prefix="" /></TableCell>
                      <TableCell>
                        {!readOnly && <form action={deleteHoldingAction}>
                          <input type="hidden" name="holdingId" value={h.id} />
                          <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${h.symbol}`}><Trash2 className="size-3.5" /></Button>
                        </form>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!readOnly && (
      <>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Add or update a position</CardTitle></CardHeader>
          <CardContent><AddHoldingForm accounts={accounts} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Accounts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {accounts.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Mode</TableHead><TableHead>Cash</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}<div className="text-[11px] text-muted-foreground">{a.institution}</div></TableCell>
                      <TableCell className="text-xs">{a.account_type}</TableCell>
                      <TableCell className="text-xs">{a.tracking_mode}</TableCell>
                      <TableCell>
                        {a.tracking_mode === "positions" ? <CashForm accountId={a.id} cash={a.cash_balance} /> : <span className="num text-xs">{formatMoney(a.cash_balance)} <span className="text-muted-foreground">(derived)</span></span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <CreateAccountForm />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Import CSV</CardTitle>
          <p className="text-xs text-muted-foreground">Positions or transaction exports from Fidelity, Schwab, Vanguard or any CSV with Symbol/Quantity (positions) or Date/Action (transactions) columns. Preview first — nothing is saved until you import.</p>
        </CardHeader>
        <CardContent><ImportPanel accounts={accounts} /></CardContent>
      </Card>
      </>
      )}
    </>
  );
}

function Stat({ label, value, sub, tone, kind }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" | null; kind: "calculated" | "reported" }) {
  return (
    <Card>
      <CardContent className="pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          <ProvenanceTag kind={kind} provider={kind === "calculated" ? "calc" : "manual"} />
        </div>
        <div className="mt-1 text-xl font-semibold tracking-tight"><Value text={value} tone={tone} /></div>
        {sub && <div className="text-xs"><Value text={sub} tone={tone} /></div>}
      </CardContent>
    </Card>
  );
}

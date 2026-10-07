"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SECTORS } from "@/lib/profile/dna";
import { saveDnaAction, type DnaState } from "./actions";

type Defaults = Record<string, string | boolean | string[]>;

const STEPS = ["Goals", "Universe", "Style", "Criteria", "Portfolio rules", "Philosophy"] as const;

function Field({
  name,
  label,
  unit,
  hint,
  d,
  errors,
  min,
  max,
  step = "any",
}: {
  name: string;
  label: string;
  unit?: string;
  hint?: string;
  d: Defaults;
  errors?: Record<string, string[] | undefined>;
  min?: number;
  max?: number;
  step?: string;
}) {
  const err = errors?.[name]?.[0];
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input id={name} name={name} type="number" inputMode="decimal" min={min} max={max} step={step} defaultValue={String(d[name] ?? "")} aria-invalid={!!err} className="max-w-36" />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {err && <p className="text-[11px] text-destructive">{err}</p>}
    </div>
  );
}

function Scale({ name, label, min, max, left, right, d }: { name: string; label: string; min: number; max: number; left: string; right: string; d: Defaults }) {
  const [v, setV] = useState(String(d[name] || ""));
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}{v !== "" && <span className="ml-1 font-semibold text-foreground">{v}</span>}</Label>
      <input id={name} name={name} type="range" min={min} max={max} step={1} value={v === "" ? String(Math.round((min + max) / 2)) : v} onChange={(e) => setV(e.target.value)} className="w-full max-w-sm accent-primary" />
      <div className="flex max-w-sm justify-between text-[11px] text-muted-foreground"><span>{left}</span><span>{right}</span></div>
      {v === "" && <input type="hidden" name={name} value="" />}
      {v === "" && <p className="text-[11px] text-muted-foreground">Not set — move the slider to set it.</p>}
    </div>
  );
}

function Sectors({ name, label, d }: { name: string; label: string; d: Defaults }) {
  const sel = new Set((d[name] as string[]) ?? []);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {SECTORS.map((s) => (
          <label key={s} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input type="checkbox" name={name} value={s} defaultChecked={sel.has(s)} className="size-3" /> {s}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DnaWizard({ defaults }: { defaults: Defaults }) {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState<DnaState, FormData>(saveDnaAction, { ok: false });
  const e = state.fieldErrors;
  const show = (i: number) => cn("space-y-4", step !== i && "hidden");
  const stepHasError = (names: string[]) => names.some((n) => e?.[n]?.length);
  const STEP_FIELDS: string[][] = [
    ["horizonYears", "riskTolerance", "targetReturn", "maxDrawdown"],
    ["marketCapMin", "marketCapMax", "preferredSectors", "excludedSectors"],
    ["growthValueTilt", "dividendPreference", "momentumPreference"],
    ["minRevenueGrowth", "minEpsGrowth", "minFcfGrowth", "minRoic", "maxNetDebtToEbitda", "maxForwardPe", "maxEvToEbitda", "maxPriceToFcf", "minGrossMargin", "minFcfMargin"],
    ["maxPositionWeight", "maxSectorWeight", "preferredPositionWeight", "cashTargetWeight", "maxSpeculativeWeight"],
    ["freeformInstructions"],
  ];

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm",
              step === i ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <span className={cn("flex size-5 items-center justify-center rounded-full border text-[10px]", stepHasError(STEP_FIELDS[i]) && "border-destructive text-destructive")}>{i + 1}</span>
            {s}
          </button>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">
        <section className={show(0)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="horizonYears" label="Investment horizon" unit="years" d={defaults} errors={e} min={0} max={80} step="1" />
            <Scale name="riskTolerance" label="Risk tolerance" min={1} max={10} left="Very conservative" right="Very aggressive" d={defaults} />
            <Field name="targetReturn" label="Target annual return" unit="%" hint="A goal, used for planning — not a forecast." d={defaults} errors={e} />
            <Field name="maxDrawdown" label="Maximum acceptable drawdown" unit="%" hint="Largest peak-to-trough fall you could tolerate." d={defaults} errors={e} min={0} max={100} />
          </div>
        </section>

        <section className={show(1)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="marketCapMin" label="Minimum market cap" unit="$B" d={defaults} errors={e} min={0} />
            <Field name="marketCapMax" label="Maximum market cap" unit="$B" hint="Leave blank for no upper limit." d={defaults} errors={e} min={0} />
          </div>
          <Sectors name="preferredSectors" label="Preferred sectors (soft preference)" d={defaults} />
          <Sectors name="excludedSectors" label="Excluded sectors (hard rule — never recommended)" d={defaults} />
          {e?.excludedSectors?.[0] && <p className="text-[11px] text-destructive">{e.excludedSectors[0]}</p>}
        </section>

        <section className={show(2)}>
          <Scale name="growthValueTilt" label="Growth vs value" min={-5} max={5} left="Deep value" right="High growth" d={defaults} />
          <Scale name="dividendPreference" label="Dividend preference" min={0} max={5} left="Don't care" right="Strongly prefer" d={defaults} />
          <Scale name="momentumPreference" label="Momentum preference" min={0} max={5} left="Ignore" right="Strongly prefer" d={defaults} />
        </section>

        <section className={show(3)}>
          <p className="text-xs text-muted-foreground">Leave any field blank to not apply that rule. Minimums apply to the most recent reported year unless noted.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="minRevenueGrowth" label="Min revenue growth" unit="% YoY" d={defaults} errors={e} />
            <Field name="minEpsGrowth" label="Min EPS growth" unit="% YoY" d={defaults} errors={e} />
            <Field name="minFcfGrowth" label="Min FCF growth" unit="% YoY" d={defaults} errors={e} />
            <Field name="minRoic" label="Min ROIC" unit="%" d={defaults} errors={e} />
            <Field name="minGrossMargin" label="Min gross margin" unit="%" d={defaults} errors={e} />
            <Field name="minFcfMargin" label="Min FCF margin" unit="%" d={defaults} errors={e} />
            <Field name="maxNetDebtToEbitda" label="Max net debt / EBITDA" unit="×" d={defaults} errors={e} />
            <Field name="maxForwardPe" label="Max forward P/E" unit="×" d={defaults} errors={e} min={0} />
            <Field name="maxEvToEbitda" label="Max EV / EBITDA" unit="×" d={defaults} errors={e} min={0} />
            <Field name="maxPriceToFcf" label="Max price / FCF" unit="×" d={defaults} errors={e} min={0} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireProfitability" defaultChecked={!!defaults.requireProfitability} className="size-4" />
            Require profitability (positive net income and operating cash flow)
          </label>
        </section>

        <section className={show(4)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="maxPositionWeight" label="Max single-stock weight" unit="% of portfolio" d={defaults} errors={e} min={0} max={100} />
            <Field name="maxSectorWeight" label="Max sector weight" unit="% of portfolio" d={defaults} errors={e} min={0} max={100} />
            <Field name="preferredPositionWeight" label="Preferred new-position size" unit="% of portfolio" d={defaults} errors={e} min={0} max={100} />
            <Field name="cashTargetWeight" label="Cash target" unit="% of portfolio" d={defaults} errors={e} min={0} max={100} />
            <Field name="maxSpeculativeWeight" label="Max speculative allocation" unit="% of portfolio" d={defaults} errors={e} min={0} max={100} />
          </div>
        </section>

        <section className={show(5)}>
          <div className="space-y-1">
            <Label htmlFor="freeformInstructions">Your investment philosophy, in your own words</Label>
            <Textarea
              id="freeformInstructions"
              name="freeformInstructions"
              rows={7}
              maxLength={4000}
              defaultValue={String(defaults.freeformInstructions ?? "")}
              placeholder="I prefer profitable companies with strong revenue growth and durable competitive advantages. I am willing to pay a higher valuation for exceptional businesses but want to avoid companies whose valuation depends on unrealistic future growth."
            />
            <p className="text-[11px] text-muted-foreground">
              Saved as written. In Phase 5, Claude will propose structured rules from this text and show them to you for confirmation before they affect anything.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {step < STEPS.length - 1 && <Button type="button" variant="outline" onClick={() => setStep((s) => s + 1)}>Next</Button>}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save Investment DNA"}</Button>
          {state.message && <span className={state.ok ? "text-xs text-positive" : "text-xs text-destructive"}>{state.message}</span>}
        </div>
      </div>
    </form>
  );
}

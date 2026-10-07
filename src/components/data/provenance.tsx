import { cn } from "@/lib/utils";
import { DATA_KIND_LABEL, PROVIDER_LABEL, type DataKind, type ProviderId, DATA_UNAVAILABLE } from "@/lib/domain/provenance";
import { formatAge, formatTimestamp, MISSING, priceStaleness, type Staleness } from "@/lib/format";

const KIND_CLASS: Record<DataKind, string> = {
  reported: "text-prov-fact border-prov-fact/30",
  provider_derived: "text-prov-fact border-prov-fact/30 border-dashed",
  calculated: "text-prov-calculated border-prov-calculated/30",
  estimate: "text-prov-estimate border-prov-estimate/30",
  ai_interpretation: "text-prov-ai border-prov-ai/30",
  scenario_assumption: "text-prov-assumption border-prov-assumption/30",
};

const KIND_SHORT: Record<DataKind, string> = {
  reported: "FACT",
  provider_derived: "PROV",
  calculated: "CALC",
  estimate: "EST",
  ai_interpretation: "AI",
  scenario_assumption: "ASSUMP",
};

/** Small tag that classifies a value: fact / calculated / estimate / AI / assumption. */
export function ProvenanceTag({
  kind,
  provider,
  asOf,
  className,
}: {
  kind: DataKind;
  provider?: ProviderId | null;
  asOf?: string | null;
  className?: string;
}) {
  const title = [DATA_KIND_LABEL[kind], provider ? `Source: ${PROVIDER_LABEL[provider]}` : null, asOf ? `As of ${asOf}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      title={title}
      className={cn("inline-flex items-center rounded border px-1 py-px font-mono text-[9px] font-semibold tracking-wider", KIND_CLASS[kind], className)}
    >
      {KIND_SHORT[kind]}
    </span>
  );
}

const STALE_CLASS: Record<Staleness, string> = {
  fresh: "bg-positive",
  stale: "bg-warning",
  critical: "bg-negative",
  unknown: "bg-muted-foreground/40",
};

/** "As of <time> · <source>" with a freshness dot. */
export function DataAsOf({
  timestamp,
  provider,
  staleness,
  className,
  prefix = "As of",
}: {
  timestamp: string | null | undefined;
  provider?: ProviderId | null;
  staleness?: Staleness;
  className?: string;
  prefix?: string;
}) {
  const s = staleness ?? priceStaleness(timestamp);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)} title={timestamp ? formatTimestamp(timestamp) : DATA_UNAVAILABLE}>
      <span className={cn("size-1.5 rounded-full", STALE_CLASS[s])} aria-hidden />
      {timestamp ? `${prefix} ${formatTimestamp(timestamp)} (${formatAge(timestamp)})` : DATA_UNAVAILABLE}
      {provider && <span className="text-muted-foreground/80">· {PROVIDER_LABEL[provider]}</span>}
    </span>
  );
}

/** Renders a formatted value, or an em dash with "Data unavailable" for screen readers/tooltips. */
export function Value({ text, className, tone }: { text: string; className?: string; tone?: "positive" | "negative" | null }) {
  if (text === MISSING)
    return (
      <span className={cn("text-muted-foreground", className)} title={DATA_UNAVAILABLE} aria-label={DATA_UNAVAILABLE}>
        {MISSING}
      </span>
    );
  return <span className={cn("num", tone === "positive" && "text-positive", tone === "negative" && "text-negative", className)}>{text}</span>;
}

export const toneOf = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? null : v > 0 ? "positive" : "negative");

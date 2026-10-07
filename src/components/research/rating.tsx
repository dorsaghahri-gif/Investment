import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ratingLabel, type Rating } from "@/lib/research/recommend";
import { MISSING } from "@/lib/format";

const VARIANT: Record<Rating, "positive" | "negative" | "warning" | "secondary" | "outline"> = {
  strong_buy: "positive",
  buy: "positive",
  watch: "warning",
  hold: "secondary",
  reduce: "negative",
  avoid: "negative",
};

export function RatingBadge({ rating, held, className }: { rating: Rating; held: boolean; className?: string }) {
  return (
    <Badge variant={VARIANT[rating]} className={cn("uppercase tracking-wide", className)}>
      {ratingLabel(rating, held)}
    </Badge>
  );
}

export function ConfidenceTag({ confidence }: { confidence: "high" | "medium" | "low" }) {
  return (
    <span className={cn("text-[11px]", confidence === "low" ? "text-warning" : "text-muted-foreground")} title="Based on how much of the score's inputs are available and fresh">
      {confidence} confidence
    </span>
  );
}

/** 0–100 score with a thin bar. Null renders as "Insufficient data". */
export function ScoreBar({ value, label, className }: { value: number | null; label?: string; className?: string }) {
  return (
    <div className={cn("min-w-28", className)}>
      {label && <div className="mb-0.5 text-[11px] text-muted-foreground">{label}</div>}
      {value === null ? (
        <span className="text-xs text-muted-foreground" title="Data unavailable">Insufficient data</span>
      ) : (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-viz-1" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
          </div>
          <span className="num w-9 text-right text-xs font-medium">{value.toFixed(0)}</span>
        </div>
      )}
    </div>
  );
}

export const scoreText = (v: number | null | undefined) => (v === null || v === undefined ? MISSING : v.toFixed(1));

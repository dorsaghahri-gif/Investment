import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Watchlists" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Watchlists & Journal" phase={4} summary="Multiple lists tracked over time, plus your investment journal." items={["Lists: Own, High Conviction, Buy on Weakness, Research, Speculative, Dividend, AI, custom", "Change tracking since a symbol was added (price, score)", "Investment journal (buy / sell / watch / pass with thesis, catalysts, risks, confidence)", "Trade evaluator vs benchmark — informative, never judgmental"]} />;
}

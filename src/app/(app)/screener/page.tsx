import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Screener" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Screener" phase={4} summary="Stock Rover-style rule builder plus AI screening." items={["AND / OR rule groups with weights; saved screeners", "Columns: ticker, company, price, market cap, score, quality, growth, valuation, momentum, risk, why it matches", "AI screening: natural language → interpreted criteria shown for confirmation → deterministic run", "Sorting, filtering, column selection, CSV export"]} />;
}

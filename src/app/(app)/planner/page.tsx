import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Planner" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Future Investment Planner" phase={6} summary="Plan how to deploy new money against your Investment DNA." items={["Gap analysis: where the portfolio is underweight or overexposed", "Conservative / Balanced / Aggressive allocations with per-position rationale, risk, valuation and expected role", "No guaranteed returns"]} />;
}

import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Scenarios" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Scenario Lab" phase={6} summary="Before/after portfolio analysis, macro scenarios and Monte Carlo." items={["Add/remove/resize positions, cash, monthly and lump-sum contributions", "Weights, sector weights, historical volatility, beta, correlation, drawdown, concentration — historical figures labelled as historical", "Hypothetical macro scenarios with visible, editable assumptions", "Monte Carlo (≥5,000 paths, seeded): 10/25/50/75/90th percentiles, probability of reaching target"]} />;
}

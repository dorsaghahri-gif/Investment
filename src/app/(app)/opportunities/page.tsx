import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Opportunities" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Opportunity Radar" phase={4} summary="Daily screener runs compared with the prior day." items={["New entrants, improving and deteriorating stocks", "Valuation opportunities, momentum breakouts, earnings revision changes", "Every entry links to the score deltas that produced it"]} />;
}

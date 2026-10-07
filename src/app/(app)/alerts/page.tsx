import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Alerts" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Alerts" phase={7} summary="Rules evaluated after every data refresh." items={["Price, valuation, investment score, recommendation, earnings, revisions, SEC filings, insider activity", "Portfolio concentration, drawdown, new screener matches", "Cool-downs and de-duplication; email notification"]} />;
}

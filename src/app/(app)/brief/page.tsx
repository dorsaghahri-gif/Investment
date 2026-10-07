import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Daily Brief" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Daily Investment Brief" phase={7} summary="Generated after each daily refresh from stored change events." items={["Portfolio overview, what changed (1d / 7d / 30d), contributors and detractors", "Company news, earnings/guidance, analyst revisions, valuation and risk changes", "New opportunities, watchlist changes, alerts, AI investment committee", "Today's action board: Review now / Watch / No action — “No portfolio action recommended today” is a valid outcome"]} />;
}

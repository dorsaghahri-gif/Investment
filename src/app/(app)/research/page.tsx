import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Research" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Research" phase={3} summary="A research page for every ticker." items={["Header: price, daily move, market cap, investment score, recommendation", "Tabs: Overview, Financials, Valuation, Growth, Quality, Estimates, News, Insiders, Technicals, Peers, AI Thesis", "Historical charts for major financial metrics", "Peer comparison with premium/discount highlighting", "Investment memo (Phase 5)"]} />;
}

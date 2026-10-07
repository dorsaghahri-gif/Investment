import { PlannedFeature } from "@/components/layout/planned-feature";
import { requireUser } from "@/lib/auth/dal";
export const metadata = { title: "Ask My Portfolio" };
export default async function Page() {
  await requireUser();
  return <PlannedFeature title="Ask My Portfolio" phase={5} summary="Grounded chat over your portfolio, criteria and stored research." items={["Claude retrieves data through tools — never answers financial values from memory", "Answer format: Answer, Key evidence, Portfolio impact, Bull/Base/Bear, Risks, What to watch, Confidence, Data as of", "Numeric grounding check: any number not traceable to stored data is removed and flagged", "Missing data is stated as “Data unavailable”"]} />;
}

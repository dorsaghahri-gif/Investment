import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./page-header";

/** Honest placeholder for routes delivered in later phases (no fake data). */
export function PlannedFeature({ title, phase, summary, items }: { title: string; phase: number; summary: string; items: string[] }) {
  return (
    <>
      <PageHeader title={title} description={summary} actions={<Badge variant="secondary">Planned · Phase {phase}</Badge>} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>What this page will do</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">See BUILD_PLAN.md for acceptance criteria. No sample or placeholder numbers are shown until real data backs them.</p>
        </CardContent>
      </Card>
    </>
  );
}

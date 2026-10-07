import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth/dal";
import { listAccess } from "@/lib/auth/access-admin";
import { formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteForm } from "./invite-form";
import { restoreAction, revokeAction, roleAction } from "./actions";

export const metadata: Metadata = { title: "Access" };

export default async function AccessPage() {
  const user = await requireOwner();
  const entries = await listAccess(user);
  return (
    <>
      <PageHeader
        title="Access"
        description="The app is invite-only. Each person gets their own private portfolio; nobody (including owners) can see another person's portfolio unless it is explicitly shared."
      />
      <Card className="mb-4">
        <CardHeader><CardTitle>Invite someone</CardTitle></CardHeader>
        <CardContent><InviteForm /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>People with access</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Invited</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => {
                const self = e.email.toLowerCase() === user.email;
                return (
                  <TableRow key={e.email}>
                    <TableCell className="pl-4 text-sm">{e.email}{self && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</TableCell>
                    <TableCell className="text-sm">{e.display_name ?? "—"}</TableCell>
                    <TableCell>
                      {self ? (
                        <Badge variant="secondary">{e.role}</Badge>
                      ) : (
                        <form action={roleAction} className="flex items-center gap-1">
                          <input type="hidden" name="email" value={e.email} />
                          <input type="hidden" name="role" value={e.role === "owner" ? "member" : "owner"} />
                          <Badge variant="secondary">{e.role}</Badge>
                          <Button size="xs" variant="ghost">{e.role === "owner" ? "Make member" : "Make owner"}</Button>
                        </form>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{formatTimestamp(e.invited_at)}</TableCell>
                    <TableCell>{e.revoked_at ? <Badge variant="negative">revoked</Badge> : <Badge variant="positive">active</Badge>}</TableCell>
                    <TableCell className="text-right pr-4">
                      {!self && (
                        <form action={e.revoked_at ? restoreAction : revokeAction}>
                          <input type="hidden" name="email" value={e.email} />
                          <Button size="xs" variant={e.revoked_at ? "outline" : "ghost"}>{e.revoked_at ? "Restore" : "Revoke"}</Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="px-4 pt-3 text-[11px] text-muted-foreground">Revoking takes effect immediately: the database stops returning any data to that person, even if they are still signed in.</p>
        </CardContent>
      </Card>
    </>
  );
}

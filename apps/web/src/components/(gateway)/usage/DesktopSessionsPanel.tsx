"use client";
import { usePrivateUsageQuery } from "./PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Logo } from "@/components/Logo";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { groupDesktopSessions, type DesktopSessionTurn } from "./desktopSessions";

export default function DesktopSessionsPanel({ scope, timeRange }: {
  scope: AccountQueryScope; timeRange: { from: string; to: string };
}) {
  const format = useDisplayFormatters();
  const query = usePrivateUsageQuery<{ turns: DesktopSessionTurn[] }>(scope, "desktop-sessions", timeRange, false,
    (signal) => fetchPrivateUsage(`/api/account/settings/usage/desktop-sessions?${new URLSearchParams({ ...timeRange, workspaceId: scope.workspaceId! })}`, scope, signal));
  const sessions = groupDesktopSessions(query.data?.turns ?? []);
  return <Card>
    <CardHeader><CardTitle>Your desktop sessions</CardTitle><p className="text-sm text-muted-foreground">Latest 100 completed turns from Claude Code and Codex. Token usage covers the main agent.</p></CardHeader>
    <CardContent>
      {query.isPending ? <p className="text-sm text-muted-foreground">Loading sessions…</p> : query.isError ?
        <p className="text-sm text-muted-foreground">Desktop history is currently unavailable.</p> : !sessions.length ?
        <p className="text-sm text-muted-foreground">No desktop sessions in this period.</p> :
        <Table><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Model</TableHead><TableHead>Status</TableHead><TableHead>Turns</TableHead><TableHead>Time worked</TableHead><TableHead>Reported tokens</TableHead><TableHead>Last activity</TableHead></TableRow></TableHeader>
          <TableBody>{sessions.map((session) => <TableRow key={session.key}>
            <TableCell><a className="inline-flex items-center gap-2 hover:underline" href={`${session.desktop_scheme}://app/${encodeURIComponent(session.environment_id)}/${encodeURIComponent(session.session_id)}`} title="Open chat in desktop">
              <Logo id={session.provider === "codex" ? "openai" : "anthropic"} width={16} height={16} />
              {session.provider === "codex" ? "Codex" : "Claude Code"} · {session.session_id.slice(0, 8)}
            </a></TableCell>
            <TableCell>{session.model}</TableCell><TableCell className="capitalize">{session.status}</TableCell>
            <TableCell>{session.turns}</TableCell><TableCell>{Math.round(session.durationMs / 1000)}s</TableCell>
            <TableCell>{session.tokens === null ? "Unavailable" : `${session.tokens.toLocaleString()}${session.partial ? " (partial)" : ""}`}</TableCell>
            <TableCell>{format.dateParts(session.completed_at, { dateStyle: "short", timeStyle: "short" })}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
    </CardContent>
  </Card>;
}

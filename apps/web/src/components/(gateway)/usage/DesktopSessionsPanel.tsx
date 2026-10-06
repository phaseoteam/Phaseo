"use client";
import { useTranslations } from "next-intl";
import { usePrivateUsageQuery } from "./PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Logo } from "@/components/Logo";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { groupDesktopSessions, type DesktopSessionTurn } from "./desktopSessions";

export default function DesktopSessionsPanel({ scope, timeRange, appFilter, modelFilter, providerFilter, sessionFilter }: {
  scope: AccountQueryScope; timeRange: { from: string; to: string };
  appFilter?: string | null; modelFilter?: string | null; providerFilter?: string | null; sessionFilter?: string | null;
}) {
  const t = useTranslations("SettingsUI.desktopSessions");
  const statuses = { completed: t("completed"), failed: t("failed"), cancelled: t("cancelled"), interrupted: t("interrupted") };
  const format = useDisplayFormatters();
  const params = { ...timeRange, ...(appFilter ? { app: appFilter } : {}), ...(modelFilter ? { model: modelFilter } : {}), ...(providerFilter ? { provider: providerFilter } : {}), ...(sessionFilter ? { session: sessionFilter } : {}) };
  const query = usePrivateUsageQuery<{ turns: DesktopSessionTurn[] }>(scope, "desktop-sessions", params, false,
    (signal) => fetchPrivateUsage(`/api/account/settings/usage/desktop-sessions?${new URLSearchParams({ ...params, workspaceId: scope.workspaceId! })}`, scope, signal));
  const sessions = groupDesktopSessions(query.data?.turns ?? []);
  return <Card>
    <CardHeader><CardTitle>{t("title")}</CardTitle><p className="text-sm text-muted-foreground">{t("description", { limit: format.number(100) })}</p></CardHeader>
    <CardContent>
      {query.isPending ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : query.isError && !query.data ?
        <p className="text-sm text-muted-foreground">{t("historyUnavailable")}</p> : !sessions.length ?
        <p className="text-sm text-muted-foreground">{t("empty")}</p> :
        <Table><TableHeader><TableRow><TableHead>{t("session")}</TableHead><TableHead>{t("model")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("turns")}</TableHead><TableHead>{t("duration")}</TableHead><TableHead>{t("tokens")}</TableHead><TableHead>{t("lastActivity")}</TableHead></TableRow></TableHeader>
          <TableBody>{sessions.map((session) => <TableRow key={session.key}>
            <TableCell><a className="inline-flex items-center gap-2 hover:underline" href={`${session.desktop_scheme}://app/${encodeURIComponent(session.environment_id)}/${encodeURIComponent(session.session_id)}`} title={t("openChat")}>
              <Logo id={session.provider === "codex" ? "openai" : "anthropic"} width={16} height={16} />
              {session.provider === "codex" ? t("codex") : t("claudeCode")} · {session.session_id.slice(0, 8)}
            </a></TableCell>
            <TableCell>{session.model}</TableCell><TableCell className="capitalize">{statuses[session.status]}</TableCell>
            <TableCell>{session.turns}</TableCell><TableCell>{t("seconds", { seconds: format.number(Math.round(session.durationMs / 1000)) })}</TableCell>
            <TableCell>{session.tokens === null ? t("unavailable") : session.partial ? t("partialTokens", { count: format.number(session.tokens) }) : format.number(session.tokens)}</TableCell>
            <TableCell>{format.dateParts(session.completed_at, { dateStyle: "short", timeStyle: "short" })}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
    </CardContent>
  </Card>;
}

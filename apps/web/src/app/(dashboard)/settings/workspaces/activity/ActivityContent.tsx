"use client";
import { useSearchParams } from "next/navigation";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import type { fetchSettingsAuditEvents, WorkspaceAuditEvent } from "@/lib/fetchers/internal/fetchSettingsAuditEvents";
type ActivityData = Awaited<ReturnType<typeof fetchSettingsAuditEvents>>;

const ACTION_LABELS: Record<string, string> = {
	"api_key.created": "API key created",
	"api_key.updated": "API key updated",
	"api_key.paused": "API key paused",
	"api_key.resumed": "API key resumed",
	"api_key.limits_updated": "API key limits updated",
	"api_key.rotated": "API key rotated",
	"api_key.deleted": "API key deleted",
	"management_key.created": "Management key created",
	"management_key.updated": "Management key updated",
	"management_key.paused": "Management key paused",
	"management_key.resumed": "Management key resumed",
	"management_key.access_updated": "Management key access updated",
	"management_key.limits_updated": "Management key limits updated",
	"management_key.deleted": "Management key deleted",
	"provider_credential.created": "Provider credential created",
	"provider_credential.updated": "Provider credential updated",
	"provider_credential.deleted": "Provider credential deleted",
	"provider_credential.reordered": "Provider credentials reordered",
	"private_model.created": "Private model created",
	"private_model.updated": "Private model updated",
	"private_model.deleted": "Private model deleted",
};

function actorLabel(event: WorkspaceAuditEvent) {
	return event.actor?.displayName || event.actor?.email || event.actor_user_id || "System";
}

function changeSummary(event: WorkspaceAuditEvent) {
	const fields = Array.isArray(event.metadata.changedFields) ? event.metadata.changedFields.map(String) : [];
	if (fields.length) return fields.map((field) => field.replaceAll("_", " ")).join(", ");
	if (event.action.endsWith("limits_updated")) return "Request and spend limits";
	if (event.action === "api_key.rotated") return "Replacement key created";
	if (event.action === "provider_credential.reordered") return "Priority order changed";
	const status = typeof event.metadata.status === "string" ? event.metadata.status : null;
	return status ? `Status: ${status}` : "—";
}

export default function WorkspaceActivityPage() {
	const cursor = useSearchParams().get("cursor");
	return <PrivateSettingsQuery<ActivityData> path={`/api/account/settings/audit-events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`}>{(data) => <ActivityTable data={data} />}</PrivateSettingsQuery>;
}

function ActivityTable({ data }: { data: ActivityData }) {

	return (
		<div className="space-y-6">
			<SettingsPageHeader title="Activity" description="Review security-sensitive workspace administration changes." />
			{!data.workspaceId ? (
				<Alert><AlertTitle>No workspace selected</AlertTitle><AlertDescription>Select a workspace to view its activity.</AlertDescription></Alert>
			) : data.events.length === 0 ? (
				<Alert><AlertTitle>No activity yet</AlertTitle><AlertDescription>Key lifecycle changes will appear here.</AlertDescription></Alert>
			) : (
				<Card>
					<CardContent className="px-0">
						<Table>
							<TableHeader><TableRow><TableHead className="pl-5">Event</TableHead><TableHead>Target</TableHead><TableHead>Actor</TableHead><TableHead>Changes</TableHead><TableHead className="pr-5 text-right">Time</TableHead></TableRow></TableHeader>
							<TableBody>
								{data.events.map((event) => (
									<TableRow key={event.id}>
										<TableCell className="pl-5 font-medium">{ACTION_LABELS[event.action] ?? event.action}</TableCell>
										<TableCell><div>{event.target_name || event.target_id}</div><Badge variant="outline" className="mt-1 font-mono text-[10px]">{event.target_type.replaceAll("_", " ")}</Badge></TableCell>
										<TableCell>{actorLabel(event)}</TableCell>
										<TableCell className="text-muted-foreground">{changeSummary(event)}</TableCell>
										<TableCell className="pr-5 text-right whitespace-nowrap"><time dateTime={event.created_at}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(event.created_at))} UTC</time></TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						{data.nextCursor ? (
							<div className="flex justify-end border-t px-5 pt-4">
								<Button asChild variant="outline" size="sm"><Link href={`/settings/workspaces/activity?cursor=${encodeURIComponent(data.nextCursor)}`}>View older events</Link></Button>
							</div>
						) : null}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

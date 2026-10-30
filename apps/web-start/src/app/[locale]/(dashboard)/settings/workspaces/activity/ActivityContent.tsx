"use client";
import { useSearchParams } from "next/navigation";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import type { fetchSettingsAuditEvents, WorkspaceAuditEvent } from "@/lib/fetchers/internal/fetchSettingsAuditEvents";
type ActivityData = Awaited<ReturnType<typeof fetchSettingsAuditEvents>>;

const ACTION_LABELS: Record<string, string> = {
	"api_key.created": "apiKeyCreated",
	"api_key.updated": "apiKeyUpdated",
	"api_key.paused": "apiKeyPaused",
	"api_key.resumed": "apiKeyResumed",
	"api_key.limits_updated": "apiKeyLimitsUpdated",
	"api_key.rotated": "apiKeyRotated",
	"api_key.deleted": "apiKeyDeleted",
	"management_key.created": "managementKeyCreated",
	"management_key.updated": "managementKeyUpdated",
	"management_key.paused": "managementKeyPaused",
	"management_key.resumed": "managementKeyResumed",
	"management_key.access_updated": "managementKeyAccessUpdated",
	"management_key.limits_updated": "managementKeyLimitsUpdated",
	"management_key.deleted": "managementKeyDeleted",
	"provider_credential.created": "providerCredentialCreated",
	"provider_credential.updated": "providerCredentialUpdated",
	"provider_credential.deleted": "providerCredentialDeleted",
	"provider_credential.reordered": "providerCredentialsReordered",
	"private_model.created": "privateModelCreated",
	"private_model.updated": "privateModelUpdated",
	"private_model.deleted": "privateModelDeleted",
};

export default function WorkspaceActivityPage() {
	const cursor = useSearchParams().get("cursor");
	return <PrivateSettingsQuery<ActivityData> path={`/api/account/settings/audit-events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`}>{(data) => <ActivityTable data={data} />}</PrivateSettingsQuery>;
}

function ActivityTable({ data }: { data: ActivityData }) {
	const t = useTranslations("SettingsUI.workspaceActivity");
	const format = useDisplayFormatters();
	const actionLabel = (action: string) => {
		const key = ACTION_LABELS[action];
		return key ? t(`actions.${key}` as never) : action;
	};
	const changeSummary = (event: WorkspaceAuditEvent) => {
		const fields = Array.isArray(event.metadata.changedFields)
			? event.metadata.changedFields.map(String)
			: [];
		if (fields.length) return t("changedFields", { fields: fields.join(", ") });
		if (event.action.endsWith("limits_updated")) return t("requestAndSpendLimits");
		if (event.action === "api_key.rotated") return t("replacementKeyCreated");
		if (event.action === "provider_credential.reordered") {
			return t("priorityOrderChanged");
		}
		const status =
			typeof event.metadata.status === "string" ? event.metadata.status : null;
		return status ? t("statusSummary", { status }) : "—";
	};


	return (
		<div className="space-y-6">
			<SettingsPageHeader title={t("title")} description={t("description")} />
			{!data.workspaceId ? (
				<Alert><AlertTitle>{t("noWorkspaceSelected")}</AlertTitle><AlertDescription>{t("selectWorkspace")}</AlertDescription></Alert>
			) : data.events.length === 0 ? (
				<Alert><AlertTitle>{t("noActivityYet")}</AlertTitle><AlertDescription>{t("keyLifecycleChanges")}</AlertDescription></Alert>
			) : (
				<Card>
					<CardContent className="px-0">
						<Table>
							<TableHeader><TableRow><TableHead className="pl-5">{t("event")}</TableHead><TableHead>{t("target")}</TableHead><TableHead>{t("actor")}</TableHead><TableHead>{t("changes")}</TableHead><TableHead className="pr-5 text-right">{t("time")}</TableHead></TableRow></TableHeader>
							<TableBody>
								{data.events.map((event) => (
									<TableRow key={event.id}>
										<TableCell className="pl-5 font-medium">{actionLabel(event.action)}</TableCell>
										<TableCell><div>{event.target_name || event.target_id}</div><Badge variant="outline" className="mt-1 font-mono text-[10px]">{event.target_type}</Badge></TableCell>
										<TableCell>{event.actor?.displayName || event.actor?.email || event.actor_user_id || t("system")}</TableCell>
										<TableCell className="text-muted-foreground">{changeSummary(event)}</TableCell>
										<TableCell className="pr-5 text-right whitespace-nowrap"><time dateTime={event.created_at}>{format.dateParts(event.created_at, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						{data.nextCursor ? (
							<div className="flex justify-end border-t px-5 pt-4">
								<Button asChild variant="outline" size="sm"><Link href={`/settings/workspaces/activity?cursor=${encodeURIComponent(data.nextCursor)}`}>{t("viewOlderEvents")}</Link></Button>
							</div>
						) : null}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

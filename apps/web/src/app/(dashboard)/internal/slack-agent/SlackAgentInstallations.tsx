import { useTranslations, useFormatter } from "@/i18n/react";
import { DisplayDateTime } from "@/components/display/DisplayValue";
import { formatUsd } from "@/components/(gateway)/settings/slack/slackAgentForm";
import { cn } from "@/lib/utils";
import type { SlackAgentInstallation, SlackAgentInstallationStatus } from "./types";

const STATUS_KEYS = {
	active: "active",
	paused: "paused",
	payment_due: "paymentDue",
	uninstalled: "uninstalled",
} as const satisfies Record<SlackAgentInstallationStatus, string>;

/** Every Slack agent installation, newest first, for Phaseo staff. */
export function SlackAgentInstallations({ installations }: { installations: SlackAgentInstallation[] }) {
	const t = useTranslations("SettingsUI");
	const format = useFormatter();
	if (installations.length === 0) return <p className="text-sm text-muted-foreground">{t("slackAgentInstallations.none")}</p>;

	const header = "px-3 py-2 text-left font-medium";
	const number = "px-3 py-2 text-right tabular-nums";
	return (
		<div className="overflow-x-auto rounded-md border">
			<table className="w-full min-w-[960px] text-sm">
				<thead className="border-b bg-muted/40 text-xs text-muted-foreground">
					<tr>
						<th scope="col" className={header}>{t("slackAgentInstallations.workspace")}</th>
						<th scope="col" className={header}>{t("slackAgentInstallations.slackTeam")}</th>
						<th scope="col" className={header}>{t("slackAgentInstallations.status")}</th>
						<th scope="col" className={header}>{t("slackAgentInstallations.app")}</th>
						<th scope="col" className={header}>{t("slackAgentInstallations.installedAt")}</th>
						<th scope="col" className={header}>{t("slackAgentInstallations.uninstalledAt")}</th>
						<th scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.people")}</th>
						<th scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.answers")}</th>
						<th scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.estimatedCharge")}</th>
						<th scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.modelSpend")}</th>
					</tr>
				</thead>
				<tbody className="divide-y">
					{installations.map((installation) => (
						<tr key={installation.id} className={cn("align-top", installation.status === "uninstalled" && "text-muted-foreground")}>
							<td className="px-3 py-2">
								<div className="font-medium">{installation.workspace_name ?? t("slackAgentInstallations.unnamed")}</div>
								<div className="font-mono text-xs text-muted-foreground">{installation.workspace_id}</div>
							</td>
							<td className="px-3 py-2">
								<div>{installation.team_name ?? t("slackAgentInstallations.unnamed")}</div>
								<div className="font-mono text-xs text-muted-foreground">{installation.team_id ?? installation.enterprise_id}</div>
							</td>
							<td className={cn("px-3 py-2", installation.status === "payment_due" && "text-destructive")}>
								{t(`slackAgentInstallations.statuses.${STATUS_KEYS[installation.status] ?? "active"}`)}
							</td>
							<td className="px-3 py-2">
								<div>{installation.custom_app ? t("slackAgentInstallations.companyApp") : t("slackAgentInstallations.hostedApp")}</div>
								{installation.slack_app_id ? <div className="font-mono text-xs text-muted-foreground">{installation.slack_app_id}</div> : null}
							</td>
							<td className="whitespace-nowrap px-3 py-2"><DisplayDateTime value={installation.installed_at} /></td>
							<td className="whitespace-nowrap px-3 py-2">{installation.uninstalled_at ? <DisplayDateTime value={installation.uninstalled_at} /> : null}</td>
							<td className={number}>{format.number(installation.month.people)}</td>
							<td className={number}>{format.number(installation.month.answers)}</td>
							<td className={number}>{formatUsd(installation.month.estimated_charge_usd)}</td>
							<td className={number}>
								<div>{formatUsd(installation.month.model_spend_usd)}</div>
								<div className="text-xs text-muted-foreground">{t("slackAgentInstallations.modelRequests", { count: installation.month.model_requests })}</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

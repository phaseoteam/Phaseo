import { useTranslations, useFormatter } from "@/i18n/react";
import { DisplayDateTime } from "@/components/display/DisplayValue";
import { formatUsd } from "@/components/(gateway)/settings/slack/slackAgentForm";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

	const header = "h-auto px-3 py-2 text-left font-medium text-muted-foreground dark:text-muted-foreground";
	const number = "px-3 py-2 text-right tabular-nums";
	return (
		<div className="overflow-x-auto rounded-md border">
			<Table wrapInContainer={false} className="min-w-[960px]">
				<TableHeader className="border-b bg-muted/40 text-xs text-muted-foreground">
					<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
						<TableHead scope="col" className={header}>{t("slackAgentInstallations.workspace")}</TableHead>
						<TableHead scope="col" className={header}>{t("slackAgentInstallations.slackTeam")}</TableHead>
						<TableHead scope="col" className={header}>{t("slackAgentInstallations.status")}</TableHead>
						<TableHead scope="col" className={header}>{t("slackAgentInstallations.app")}</TableHead>
						<TableHead scope="col" className={header}>{t("slackAgentInstallations.installedAt")}</TableHead>
						<TableHead scope="col" className={header}>{t("slackAgentInstallations.uninstalledAt")}</TableHead>
						<TableHead scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.people")}</TableHead>
						<TableHead scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.answers")}</TableHead>
						<TableHead scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.estimatedCharge")}</TableHead>
						<TableHead scope="col" className={cn(header, "text-right")}>{t("slackAgentInstallations.modelSpend")}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{installations.map((installation) => (
						<TableRow key={installation.id} className={cn("align-top [&>td]:align-top", installation.status === "uninstalled" && "text-muted-foreground")}>
							<TableCell className="px-3 py-2">
								<div className="font-medium">{installation.workspace_name ?? t("slackAgentInstallations.unnamed")}</div>
								<div className="font-mono text-xs text-muted-foreground">{installation.workspace_id}</div>
							</TableCell>
							<TableCell className="px-3 py-2">
								<div>{installation.team_name ?? t("slackAgentInstallations.unnamed")}</div>
								<div className="font-mono text-xs text-muted-foreground">{installation.team_id ?? installation.enterprise_id}</div>
							</TableCell>
							<TableCell className={cn("px-3 py-2", installation.status === "payment_due" && "text-destructive")}>
								{t(`slackAgentInstallations.statuses.${STATUS_KEYS[installation.status] ?? "active"}`)}
							</TableCell>
							<TableCell className="px-3 py-2">
								<div>{installation.custom_app ? t("slackAgentInstallations.companyApp") : t("slackAgentInstallations.hostedApp")}</div>
								{installation.slack_app_id ? <div className="font-mono text-xs text-muted-foreground">{installation.slack_app_id}</div> : null}
							</TableCell>
							<TableCell className="whitespace-nowrap px-3 py-2"><DisplayDateTime value={installation.installed_at} /></TableCell>
							<TableCell className="whitespace-nowrap px-3 py-2">{installation.uninstalled_at ? <DisplayDateTime value={installation.uninstalled_at} /> : null}</TableCell>
							<TableCell className={number}>{format.number(installation.month.people)}</TableCell>
							<TableCell className={number}>{format.number(installation.month.answers)}</TableCell>
							<TableCell className={number}>{formatUsd(installation.month.estimated_charge_usd)}</TableCell>
							<TableCell className={number}>
								<div>{formatUsd(installation.month.model_spend_usd)}</div>
								<div className="text-xs text-muted-foreground">{t("slackAgentInstallations.modelRequests", { count: installation.month.model_requests })}</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

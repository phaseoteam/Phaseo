"use client";
import { SettingsResourceQuery } from "../PrivateSettingsQuery";
import type { TeamsSettingsData } from "@/lib/fetchers/internal/settingsTypes";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import WorkspaceIdentitySettings from "./WorkspaceIdentitySettings";
import WorkspaceEnterpriseDirectory from "./WorkspaceEnterpriseDirectory";

export type Mode = "overview" | "directory" | "departments" | "sso" | "scim";


export default function WorkspaceEnterpriseContent({ mode }: { mode: Mode }) {
	return <SettingsResourceQuery resource="teams">{(data) => <EnterpriseContent mode={mode} data={data} />}</SettingsResourceQuery>;
}

function EnterpriseContent({ mode, data }: { mode: Mode; data: TeamsSettingsData }) {
	const t = useTranslations("SettingsUI");
	const workspaceId = data.initialTeamId ?? null;
	const titleKey = mode === "overview" ? "enterprise" : mode === "directory" ? "directory" : mode === "departments" ? "departments" : mode === "sso" ? "singleSignOn" : "scim";
	const descriptionKey = mode === "overview" ? "enterpriseOverviewDescription" : mode === "directory" ? "directoryDescription" : mode === "departments" ? "departmentsDescription" : mode === "sso" ? "ssoDescription" : "scimDescription";
	const copy = { title: t(`headers.${titleKey}` as never), description: t(`headers.${descriptionKey}` as never) };
	const canEdit = Boolean(workspaceId && data.manageableTeamIds?.includes(workspaceId));
	const memberCount = workspaceId ? (data.membersByTeam?.[workspaceId]?.length ?? 0) : 0;

	if (!workspaceId || workspaceId === data.personalTeamId) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader title={copy.title} description={copy.description} />
				<section className="space-y-3 border-y border-border/60 py-5">
					<div>
						<p className="text-sm font-medium">{t("headers.chooseSharedWorkspace")}</p>
						<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
							{t("enterpriseIdentity.sharedWorkspaceHelp")}
						</p>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link href="/settings/account/workspaces">
							{t("enterpriseIdentity.createSharedWorkspace")}
							<ArrowUpRight className="ml-2 h-3.5 w-3.5" />
						</Link>
					</Button>
				</section>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader title={copy.title} description={copy.description} meta={mode === "directory" ? <Badge variant="secondary">{t("headers.membersCount", { count: memberCount })}</Badge> : undefined} />
			{mode === "directory" || mode === "departments" ? <WorkspaceEnterpriseDirectory
				mode={mode}
				workspaceId={workspaceId}
				members={data.membersByTeam?.[workspaceId] ?? []}
				currentUserId={data.currentUserId}
				canEdit={canEdit}
			/> : <WorkspaceIdentitySettings
				workspaceId={workspaceId}
				initialSettings={data.teamSsoSettingsByTeam?.[workspaceId]}
				canEdit={canEdit}
				canConfigureEnterprise
				mode={mode}
			/>}
		</div>
	);
}

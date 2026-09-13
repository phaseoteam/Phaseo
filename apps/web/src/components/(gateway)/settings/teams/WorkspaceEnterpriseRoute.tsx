import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";
import { fetchSettingsTeamsInitialData } from "@/lib/fetchers/internal/fetchSettingsTeamsInitialData";
import WorkspaceIdentitySettings from "./WorkspaceIdentitySettings";
import WorkspaceEnterpriseDirectory from "./WorkspaceEnterpriseDirectory";

type Mode = "overview" | "directory" | "departments" | "sso" | "scim";
type SearchParams = Record<string, string | string[] | undefined>;

const pageCopy: Record<Mode, { title: string; description: string }> = {
	overview: { title: "Enterprise", description: "Subscription, allowance and workspace identity overview." },
	directory: { title: "Directory", description: "Manage workspace access, roles and department assignments." },
	departments: { title: "Departments", description: "Organise members and map groups from your identity provider." },
	sso: { title: "Single Sign-On", description: "Connect and enforce a SAML identity provider for this workspace." },
	scim: { title: "SCIM Provisioning", description: "Provision users and groups from your identity provider." },
};

export default async function WorkspaceEnterpriseRoute({ mode, searchParams }: { mode: Mode; searchParams: Promise<SearchParams> }) {
	await connection();
	if (!(await enterpriseSelfServePreviewEnabled())) notFound();
	const params = await searchParams;
	const preferredWorkspaceId = Array.isArray(params.workspaceId) ? params.workspaceId[0] : params.workspaceId;
	const data = await fetchSettingsTeamsInitialData(preferredWorkspaceId);
	const workspaceId = data.initialTeamId ?? null;
	const copy = pageCopy[mode];
	const canEdit = Boolean(workspaceId && data.manageableTeamIds?.includes(workspaceId));
	const memberCount = workspaceId ? (data.membersByTeam?.[workspaceId]?.length ?? 0) : 0;

	if (!workspaceId || workspaceId === data.personalTeamId) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader title={copy.title} description={copy.description} />
				<section className="space-y-3 border-y border-border/60 py-5">
					<div>
						<p className="text-sm font-medium">Enterprise requires a shared workspace</p>
						<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
							Enterprise cannot be enabled on your personal workspace. Create a shared workspace first, then open Enterprise settings there to subscribe and configure identity features.
						</p>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link href="/settings/account/workspaces">
							Create a shared workspace
							<ArrowUpRight className="ml-2 h-3.5 w-3.5" />
						</Link>
					</Button>
				</section>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader title={copy.title} description={copy.description} meta={mode === "directory" ? <Badge variant="secondary">{memberCount} members</Badge> : undefined} />
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

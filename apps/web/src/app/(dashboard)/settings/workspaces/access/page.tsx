import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { getTeamsSettingsData } from "../../teams/teamsData";

export const metadata = {
	title: "Workspace Access - Settings",
};

export default function WorkspaceAccessPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<WorkspaceAccessContent searchParams={props.searchParams} />
			</Suspense>
		</div>
	);
}

async function WorkspaceAccessContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const sp = await searchParams;
	const preferredWorkspaceId =
		typeof sp?.workspace_id === "string"
			? sp.workspace_id
			: Array.isArray(sp?.workspace_id)
				? sp.workspace_id?.[0]
				: undefined;
	const data = await getTeamsSettingsData(preferredWorkspaceId);
	return (
		<TeamsSettingsContainer
			teams={data.teams}
			membersByTeam={data.membersByTeam}
			requestsByTeam={data.requestsByTeam}
			invitesByTeam={data.invitesByTeam}
			initialTeamId={data.initialTeamId}
			currentUserId={data.currentUserId}
			personalTeamId={data.personalTeamId}
			manageableTeamIds={data.manageableTeamIds}
			walletBalances={data.walletBalances}
			tab="access"
		/>
	);
}

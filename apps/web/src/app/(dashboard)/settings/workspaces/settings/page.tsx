import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { getTeamsSettingsData } from "../../teams/teamsData";

export const metadata = {
	title: "Workspace Settings - Settings",
};

export default function WorkspaceSettingsPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<WorkspaceSettingsContent />
			</Suspense>
		</div>
	);
}

async function WorkspaceSettingsContent() {
	const data = await getTeamsSettingsData();
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
			teamSsoSettingsByTeam={data.teamSsoSettingsByTeam}
			tab="settings"
		/>
	);
}

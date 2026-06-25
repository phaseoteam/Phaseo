import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { fetchSettingsTeamsInitialData } from "@/lib/fetchers/internal/fetchSettingsTeamsInitialData";

export const metadata = {
	title: "Workspace Settings - Settings",
};

export default async function WorkspaceSettingsPage() {
	const data = await fetchSettingsTeamsInitialData();

	return (
		<TeamsSettingsContainer
			teams={data.teams}
			membersByTeam={data.membersByTeam}
			invitesByTeam={data.invitesByTeam}
			requestsByTeam={data.requestsByTeam}
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

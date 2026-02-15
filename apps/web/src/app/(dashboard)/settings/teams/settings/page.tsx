import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { getTeamsSettingsData } from "../teamsData";

export const metadata = {
	title: "Team Settings - Settings",
};

export default function TeamSettingsPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<TeamSettingsContent />
			</Suspense>
		</div>
	);
}

async function TeamSettingsContent() {
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
			tab="settings"
		/>
	);
}


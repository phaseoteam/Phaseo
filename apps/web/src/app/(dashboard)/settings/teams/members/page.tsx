import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { getTeamsSettingsData } from "../teamsData";

export const metadata = {
	title: "Team Members - Settings",
};

export default function TeamMembersPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<TeamMembersContent />
			</Suspense>
		</div>
	);
}

async function TeamMembersContent() {
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
			tab="members"
		/>
	);
}


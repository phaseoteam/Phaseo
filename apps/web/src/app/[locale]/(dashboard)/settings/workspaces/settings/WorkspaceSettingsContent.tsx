"use client";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { SettingsResourceQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";

export default function WorkspaceSettingsContent({ canConfigureEnterprise }: { canConfigureEnterprise: boolean }) {

	return (
		<SettingsResourceQuery resource="teams">{(data) => <TeamsSettingsContainer
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
			canConfigureEnterprise={canConfigureEnterprise}
			tab="settings"
		/>}</SettingsResourceQuery>
	);
}

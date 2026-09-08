import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { fetchSettingsTeamsInitialData } from "@/lib/fetchers/internal/fetchSettingsTeamsInitialData";
import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";
import { connection } from "next/server";

export const metadata = {
	title: "Workspace Settings - Settings",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WorkspaceSettingsPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	await connection();
	const params = await searchParams;
	const preferredWorkspaceId = Array.isArray(params.workspaceId)
		? params.workspaceId[0]
		: params.workspaceId;
	const [data, canConfigureEnterprise] = await Promise.all([
		fetchSettingsTeamsInitialData(preferredWorkspaceId),
		enterpriseSelfServePreviewEnabled(),
	]);

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
			canConfigureEnterprise={canConfigureEnterprise}
			tab="settings"
		/>
	);
}

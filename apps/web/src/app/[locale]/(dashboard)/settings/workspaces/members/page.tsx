import { getTranslations } from "next-intl/server";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { fetchSettingsTeamsInitialData } from "@/lib/fetchers/internal/fetchSettingsTeamsInitialData";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("teamMembers") };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WorkspaceMembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
	const params = await searchParams;
	const workspaceId = Array.isArray(params.workspaceId) ? params.workspaceId[0] : params.workspaceId;
	const data = await fetchSettingsTeamsInitialData(workspaceId);
	const sampleMembersRequested =
		(Array.isArray(params.sampleMembers)
			? params.sampleMembers[0]
			: params.sampleMembers) === "1";
	const samplePreview = Boolean(
		process.env.NODE_ENV === "development" &&
			sampleMembersRequested &&
			data.initialTeamId &&
			data.initialTeamId === data.personalTeamId,
	);
	const membersByTeam = samplePreview && data.initialTeamId
		? {
				...data.membersByTeam,
				[data.initialTeamId]: [
					...(data.membersByTeam[data.initialTeamId] ?? []),
					{
						user_id: "sample-admin",
						display_name: "Maya Chen",
						role: "admin",
						spend_30d_nanos: 42_750_000_000,
						is_sample: true,
					},
					{
						user_id: "sample-member",
						display_name: "Theo Morgan",
						role: "member",
						spend_30d_nanos: 8_200_000_000,
						is_sample: true,
					},
				],
			}
		: data.membersByTeam;

	return (
		<TeamsSettingsContainer
			teams={data.teams}
			membersByTeam={membersByTeam}
			invitesByTeam={data.invitesByTeam}
			requestsByTeam={data.requestsByTeam}
			initialTeamId={data.initialTeamId}
			currentUserId={data.currentUserId}
			personalTeamId={data.personalTeamId}
			manageableTeamIds={data.manageableTeamIds}
			walletBalances={data.walletBalances}
			sampleMembersPreview={samplePreview}
			tab="members"
		/>
	);
}

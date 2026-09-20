"use client";
import { useSearchParams } from "next/navigation";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";

export default withSettingsResource("teams", function WorkspaceMembersPage({ initialData: data }) {
	const sampleMembersRequested = useSearchParams().get("sampleMembers") === "1";
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
});

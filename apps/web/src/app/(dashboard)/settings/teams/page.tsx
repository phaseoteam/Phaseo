import React from "react";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import TeamsSettingsContainer from "@/components/(gateway)/settings/teams/TeamsSettingsContainer";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = {
	title: "Teams - Settings",
};

export default function TeamsSettingsPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Teams</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Manage teams, members, and team-level access controls.
				</p>
			</div>
			<Suspense fallback={<SettingsSectionFallback />}>
				<TeamsSettingsContent />
			</Suspense>
		</div>
	);
}

async function TeamsSettingsContent() {
	const supabase = await createClient();

	// current user
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const userId = user?.id;
	let personalTeamId: string | null = null;

	if (userId) {
		const { data: userRow } = await supabase
			.from("users")
			.select("default_team_id")
			.eq("user_id", userId)
			.maybeSingle();

		personalTeamId = userRow?.default_team_id ?? null;
	}

	// ── Fetch (unchanged queries; normalise later)
	const { data: teams } = await supabase.from("teams").select("id, name");

	let teamMembers: any[] = [];
	const usersById: Record<string, any> = {};
	if (userId) {
		const { data: membershipRows } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("user_id", userId);
		const teamIds = Array.from(
			new Set(
				(membershipRows ?? [])
					.map((row: any) => row?.team_id)
					.filter(Boolean)
			)
		) as string[];

		if (teamIds.length) {
			const admin = createAdminClient();
			const { data: memberRows } = await admin
				.from("team_members")
				.select("team_id, user_id, role")
				.in("team_id", teamIds);
			teamMembers = memberRows ?? [];

			const memberUserIds = Array.from(
				new Set(
					(teamMembers ?? [])
						.map((m: any) => m?.user_id)
						.filter(Boolean)
				)
			);
			if (memberUserIds.length) {
				const { data: users } = await admin
					.from("users")
					.select("user_id, display_name")
					.in("user_id", memberUserIds as string[]);
				for (const u of users ?? []) {
					if (u?.user_id) usersById[u.user_id] = u;
				}
			}
		}
	}

	const sevenDaysAgoIso = new Date(
		Date.now() - 7 * 24 * 60 * 60 * 1000
	).toISOString();
	const { data: teamInvites } = await supabase
		.from("team_invites")
		.select("*, users(display_name)")
		.or(`expires_at.is.null,expires_at.gte.${sevenDaysAgoIso}`);

	const { data: teamJoinRequests, error } = await supabase
		.from("team_join_requests")
		.select(
			`
			id,
			team_id,
			requester_user_id,
			status,
			created_at,
			decided_at,
			teams ( name ),
			requester:users!team_join_requests_requester_user_id_fkey (
				user_id,
				display_name
			),
			decider:users!team_join_requests_decided_by_fkey (
				user_id,
				display_name
			)
		`
		)
		.or(`decided_at.is.null,decided_at.gte.${sevenDaysAgoIso}`);

	// ── Normalise
	const teamsArray = teams ?? [];
	const membersArray = (teamMembers ?? []).map((m: any) => ({
		...m,
		display_name: usersById[m.user_id]?.display_name ?? null,
	}));
	const invitesArray = teamInvites ?? [];
	const requestsArray = teamJoinRequests ?? [];

	const membersByTeam: Record<string, any[]> = {};
	for (const m of membersArray) {
		if (!m?.team_id) continue;
		(membersByTeam[m.team_id] ||= []).push(m);
	}

	const invitesByTeam: Record<string, any[]> = {};
	for (const i of invitesArray) {
		if (!i?.team_id) continue;
		(invitesByTeam[i.team_id] ||= []).push(i);
	}

	const requestsByTeam: Record<string, any[]> = {};
	for (const r of requestsArray) {
		if (!r?.team_id) continue;
		(requestsByTeam[r.team_id] ||= []).push(r);
	}

	const initialTeamId = await getTeamIdFromCookie();
	const manageableTeamIds = Object.entries(membersByTeam).reduce<string[]>(
		(acc, [teamId, members]) => {
			if (
				members?.some(
					(member: any) =>
						member?.user_id === userId &&
						["owner", "admin"].includes(
							(member?.role ?? "").toLowerCase()
						)
				)
			) {
				acc.push(teamId);
			}
			return acc;
		},
		[]
	);
	const walletBalances: Record<string, number> = {};
	if (teamsArray.length) {
		const { data: wallets } = await supabase
			.from("wallets")
			.select("team_id,balance_nanos")
			.in(
				"team_id",
				teamsArray.map((team) => team.id)
			);
		for (const wallet of wallets ?? []) {
			const teamId = wallet?.team_id;
			if (!teamId) continue;
			const nanos = Number(wallet?.balance_nanos ?? 0);
			if (!Number.isFinite(nanos)) continue;
                        walletBalances[teamId] = Number((nanos / 1_000_000_000).toFixed(2));
		}
	}
	return (
		<TeamsSettingsContainer
			teams={teamsArray}
			membersByTeam={membersByTeam}
			requestsByTeam={requestsByTeam}
			invitesByTeam={invitesByTeam}
			initialTeamId={initialTeamId}
			currentUserId={user?.id}
			personalTeamId={personalTeamId}
			manageableTeamIds={manageableTeamIds}
			walletBalances={walletBalances}
			hideTitle
		/>
	);
}

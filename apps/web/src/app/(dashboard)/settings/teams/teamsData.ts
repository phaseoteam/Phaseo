import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";

export async function getTeamsSettingsData() {
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
			.select("default_workspace_id")
			.eq("user_id", userId)
			.maybeSingle();

		personalTeamId = userRow?.default_workspace_id ?? null;
	}

	// ── Fetch (unchanged queries; normalize later)
	const { data: teams } = await supabase.from("workspaces").select("id, name");

	let teamMembers: any[] = [];
	const usersById: Record<string, any> = {};
	if (userId) {
		const { data: membershipRows } = await supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", userId);
		const workspaceIds = Array.from(
			new Set(
				(membershipRows ?? [])
					.map((row: any) => row?.workspace_id)
					.filter(Boolean),
			),
		) as string[];

		if (workspaceIds.length) {
			const admin = createAdminClient();
			const { data: memberRows } = await admin
				.from("workspace_members")
				.select("workspace_id, user_id, role")
				.in("workspace_id", workspaceIds);
			teamMembers = memberRows ?? [];

			const memberUserIds = Array.from(
				new Set(
					(teamMembers ?? []).map((m: any) => m?.user_id).filter(Boolean),
				),
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
		Date.now() - 7 * 24 * 60 * 60 * 1000,
	).toISOString();
	const { data: teamInvites } = await supabase
		.from("workspace_invites")
		.select("*, users(display_name)")
		.or(`expires_at.is.null,expires_at.gte.${sevenDaysAgoIso}`);

	const { data: teamJoinRequests } = await supabase
		.from("workspace_join_requests")
		.select(
			`
			id,
			workspace_id,
			requester_user_id,
			status,
			created_at,
			decided_at,
			teams:workspaces ( name ),
			requester:users!workspace_join_requests_requester_user_id_fkey (
				user_id,
				display_name
			),
			decider:users!workspace_join_requests_decided_by_fkey (
				user_id,
				display_name
			)
		`,
		)
		.or(`decided_at.is.null,decided_at.gte.${sevenDaysAgoIso}`);

	// ── Normalize
	const teamsArray = teams ?? [];
	const membersArray = (teamMembers ?? []).map((m: any) => ({
		...m,
		display_name: usersById[m.user_id]?.display_name ?? null,
	}));
	const invitesArray = teamInvites ?? [];
	const requestsArray = teamJoinRequests ?? [];

	const membersByTeam: Record<string, any[]> = {};
	for (const m of membersArray) {
		if (!m?.workspace_id) continue;
		(membersByTeam[m.workspace_id] ||= []).push(m);
	}

	const invitesByTeam: Record<string, any[]> = {};
	for (const i of invitesArray) {
		if (!i?.workspace_id) continue;
		(invitesByTeam[i.workspace_id] ||= []).push(i);
	}

	const requestsByTeam: Record<string, any[]> = {};
	for (const r of requestsArray) {
		if (!r?.workspace_id) continue;
		(requestsByTeam[r.workspace_id] ||= []).push(r);
	}

	const initialTeamId = await getWorkspaceIdFromCookie();
	const manageableTeamIds = Object.entries(membersByTeam).reduce<string[]>(
		(acc, [workspaceId, members]) => {
			if (
				members?.some(
					(member: any) =>
						member?.user_id === userId &&
						["owner", "admin"].includes(
							(member?.role ?? "").toLowerCase(),
						),
				)
			) {
				acc.push(workspaceId);
			}
			return acc;
		},
		[],
	);

	const walletBalances: Record<string, number> = {};
	if (teamsArray.length) {
		const { data: wallets } = await supabase
			.from("wallets")
			.select("workspace_id,balance_nanos")
			.in(
				"workspace_id",
				teamsArray.map((team) => team.id),
			);
		for (const wallet of wallets ?? []) {
			const workspaceId = wallet?.workspace_id;
			if (!workspaceId) continue;
			const nanos = Number(wallet?.balance_nanos ?? 0);
			if (!Number.isFinite(nanos)) continue;
			walletBalances[workspaceId] = Number((nanos / 1_000_000_000).toFixed(2));
		}
	}

	const teamSsoSettingsByTeam: Record<string, TeamSsoSettingsRow> = {};
	if (teamsArray.length) {
		const { data: settingsRows } = await supabase
			.from("workspace_settings")
			.select(
				"workspace_id,sso_enabled,sso_enforced,sso_mode,sso_provider_identifier,sso_domains",
			)
			.in(
				"workspace_id",
				teamsArray.map((team) => team.id),
			);

		for (const row of settingsRows ?? []) {
			const workspaceId = row?.workspace_id;
			if (!workspaceId) continue;
			teamSsoSettingsByTeam[workspaceId] = {
				sso_enabled: Boolean(row.sso_enabled),
				sso_enforced: Boolean(row.sso_enforced),
				sso_mode: String(row.sso_mode ?? "none"),
				sso_provider_identifier: row.sso_provider_identifier ?? null,
				sso_domains: Array.isArray(row.sso_domains)
					? (row.sso_domains as string[])
					: [],
			};
		}
	}

	return {
		teams: teamsArray,
		membersByTeam,
		invitesByTeam,
		requestsByTeam,
		initialTeamId,
		currentUserId: userId ?? null,
		personalTeamId,
		manageableTeamIds,
		walletBalances,
		teamSsoSettingsByTeam,
	};
}


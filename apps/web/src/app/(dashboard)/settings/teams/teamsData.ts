import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
	return Array.from(new Set(values.filter(Boolean) as string[]));
}

export async function getTeamsSettingsData() {
	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}

	const readClient: any = adminClient ?? supabase;

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const userId = user?.id;
	let personalTeamId: string | null = null;

	if (userId) {
		const { data: userRow, error: userRowError } = await readClient
			.from("users")
			.select("default_workspace_id")
			.eq("user_id", userId)
			.maybeSingle();

		if (!userRowError) {
			personalTeamId = userRow?.default_workspace_id ?? null;
		} else {
			const { data: legacyUserRow } = await (readClient as any)
				.from("users")
				.select("default_team_id")
				.eq("user_id", userId)
				.maybeSingle();
			personalTeamId = legacyUserRow?.default_team_id ?? null;
		}
	}

	let membershipRows: any[] = [];
	if (userId) {
		const { data, error } = await readClient
			.from("workspace_members")
			.select("workspace_id, user_id, role")
			.eq("user_id", userId);
		if (!error) {
			membershipRows = data ?? [];
		} else {
			const { data: legacyMembershipRows } = await (readClient as any)
				.from("team_members")
				.select("team_id, user_id, role")
				.eq("user_id", userId);
			membershipRows = (legacyMembershipRows ?? []).map((row: any) => ({
				workspace_id: row?.team_id,
				user_id: row?.user_id,
				role: row?.role,
			}));
		}
	}

	const workspaceIds = uniqueStrings([
		...(membershipRows ?? []).map((row: any) => row?.workspace_id),
		personalTeamId,
	]);

	let teams: Array<{ id: string; name: string }> = [];
	if (workspaceIds.length) {
		const { data, error } = await readClient
			.from("workspaces")
			.select("id, name")
			.in("id", workspaceIds);
		if (!error) {
			teams = data ?? [];
		} else {
			const { data: legacyTeams } = await (readClient as any)
				.from("teams")
				.select("id, name")
				.in("id", workspaceIds);
			teams = legacyTeams ?? [];
		}
	}

	let teamMembers: any[] = [];
	const usersById: Record<string, any> = {};
	if (workspaceIds.length) {
		const { data, error } = await readClient
			.from("workspace_members")
			.select("workspace_id, user_id, role")
			.in("workspace_id", workspaceIds);
		if (!error) {
			teamMembers = data ?? [];
		} else {
			const { data: legacyMembers } = await (readClient as any)
				.from("team_members")
				.select("team_id, user_id, role")
				.in("team_id", workspaceIds);
			teamMembers = (legacyMembers ?? []).map((row: any) => ({
				workspace_id: row?.team_id,
				user_id: row?.user_id,
				role: row?.role,
			}));
		}

		const memberUserIds = uniqueStrings(
			(teamMembers ?? []).map((member: any) => member?.user_id),
		);
		if (memberUserIds.length) {
			const { data: users } = await readClient
				.from("users")
				.select("user_id, display_name")
				.in("user_id", memberUserIds);
			for (const u of users ?? []) {
				if (u?.user_id) usersById[u.user_id] = u;
			}
		}
	}

	const sevenDaysAgoIso = new Date(
		Date.now() - 7 * 24 * 60 * 60 * 1000,
	).toISOString();

	let teamInvites: any[] = [];
	if (workspaceIds.length) {
		const { data, error } = await readClient
			.from("workspace_invites")
			.select("*, users(display_name)")
			.in("workspace_id", workspaceIds);
		if (!error) {
			teamInvites = data ?? [];
		} else {
			const { data: legacyInvites } = await (readClient as any)
				.from("team_invites")
				.select("*, users(display_name)")
				.in("team_id", workspaceIds);
			teamInvites = (legacyInvites ?? []).map((row: any) => ({
				...row,
				workspace_id: row?.team_id,
			}));
		}
	}

	let teamJoinRequests: any[] = [];
	if (workspaceIds.length) {
		const { data, error } = await readClient
			.from("workspace_join_requests")
			.select(
				"id, workspace_id, requester_user_id, status, created_at, decided_at, decided_by, invite_id",
			)
			.in("workspace_id", workspaceIds);
		if (!error) {
			teamJoinRequests = data ?? [];
		} else {
			const { data: legacyRequests } = await (readClient as any)
				.from("team_join_requests")
				.select(
					"id, team_id, requester_user_id, status, created_at, decided_at, decided_by, invite_id",
				)
				.in("team_id", workspaceIds);
			teamJoinRequests = (legacyRequests ?? []).map((row: any) => ({
				...row,
				workspace_id: row?.team_id,
			}));
		}
	}

	const teamsArray = teams ?? [];
	const membersArray = (teamMembers ?? []).map((member: any) => ({
		...member,
		display_name: usersById[member.user_id]?.display_name ?? null,
	}));
	const invitesArray = (teamInvites ?? []).filter((invite: any) => {
		if (!invite?.expires_at) return true;
		return new Date(invite.expires_at).toISOString() >= sevenDaysAgoIso;
	});

	const requestUserIds = uniqueStrings(
		(teamJoinRequests ?? []).flatMap((row: any) => [
			row?.requester_user_id,
			row?.decided_by,
		]),
	);

	const missingRequestUserIds = requestUserIds.filter((id) => !usersById[id]);
	if (missingRequestUserIds.length) {
		const { data: requestUsers } = await readClient
			.from("users")
			.select("user_id, display_name")
			.in("user_id", missingRequestUserIds);
		for (const userRow of requestUsers ?? []) {
			if (userRow?.user_id) usersById[userRow.user_id] = userRow;
		}
	}

	const teamNameById = Object.fromEntries(
		teamsArray.map((team) => [team.id, team.name]),
	) as Record<string, string>;

	const requestsArray = (teamJoinRequests ?? [])
		.filter((request: any) => {
			if (!request?.decided_at) return true;
			return new Date(request.decided_at).toISOString() >= sevenDaysAgoIso;
		})
		.map((request: any) => ({
			...request,
			teams: {
				name: teamNameById[request.workspace_id] ?? "Workspace",
			},
			requester: request.requester_user_id
				? {
						user_id: request.requester_user_id,
						display_name:
							usersById[request.requester_user_id]?.display_name ?? null,
				  }
				: null,
			decider: request.decided_by
				? {
						user_id: request.decided_by,
						display_name: usersById[request.decided_by]?.display_name ?? null,
				  }
				: null,
		}));

	const membersByTeam: Record<string, any[]> = {};
	for (const member of membersArray) {
		if (!member?.workspace_id) continue;
		(membersByTeam[member.workspace_id] ||= []).push(member);
	}

	const invitesByTeam: Record<string, any[]> = {};
	for (const invite of invitesArray) {
		if (!invite?.workspace_id) continue;
		(invitesByTeam[invite.workspace_id] ||= []).push(invite);
	}

	const requestsByTeam: Record<string, any[]> = {};
	for (const request of requestsArray) {
		if (!request?.workspace_id) continue;
		(requestsByTeam[request.workspace_id] ||= []).push(request);
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
		const { data: wallets } = await readClient
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
		const { data: settingsRows } = await readClient
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

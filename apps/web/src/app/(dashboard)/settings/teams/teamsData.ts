import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
	getActiveWorkspaceIdFromCookieRaw,
	getWorkspaceIdFromCookie,
} from "@/utils/workspaceCookie";

export async function getTeamsSettingsData(preferredWorkspaceId?: string | null) {
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
	let userRole: string | null = null;
	let defaultWorkspaceId: string | null = null;
	let membershipWorkspaceIds: string[] = [];
	let ownedWorkspaceIds: string[] = [];

	if (userId) {
		const { data: userRow } = await readClient
			.from("users")
			.select("default_workspace_id, role")
			.eq("user_id", userId)
			.maybeSingle();

		defaultWorkspaceId =
			String(userRow?.default_workspace_id ?? "").trim() || null;
		personalTeamId = defaultWorkspaceId;
		userRole = String(userRow?.role ?? "").trim().toLowerCase() || null;

		const { data: membershipRows } = await readClient
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", userId);
		membershipWorkspaceIds = Array.from(
			new Set(
				(membershipRows ?? [])
					.map((row: any) => String(row?.workspace_id ?? "").trim())
				.filter(Boolean),
			),
		);

		const { data: ownedWorkspaceRows } = await readClient
			.from("workspaces")
			.select("id")
			.eq("owner_user_id", userId);
		ownedWorkspaceIds = Array.from(
			new Set(
				(ownedWorkspaceRows ?? [])
					.map((row: any) => String(row?.id ?? "").trim())
					.filter(Boolean),
			),
		);
	}

	// Fetch workspaces and enrich with fallback lookups when direct joins miss names.
	let teams: Array<{ id: string; name: string }> = [];
	if (userId) {
		const accessibleWorkspaceIds = Array.from(
			new Set([...membershipWorkspaceIds, ...ownedWorkspaceIds]),
		);

		const { data: membershipTeams } = await supabase
			.from("workspace_members")
			.select("workspace_id, workspaces(id, name)")
			.eq("user_id", userId);
		teams = (membershipTeams ?? [])
			.map((row: any) => {
				const workspace =
					Array.isArray(row?.workspaces) ? row.workspaces[0] : row?.workspaces;
				const id = String(workspace?.id ?? row?.workspace_id ?? "").trim();
				const name = String(workspace?.name ?? "").trim();
				if (!id || !name) return null;
				return { id, name };
			})
				.filter((row): row is { id: string; name: string } => Boolean(row));

		if (accessibleWorkspaceIds.length) {
			const { data: scopedTeams } = await readClient
				.from("workspaces")
				.select("id, name")
				.in("id", accessibleWorkspaceIds);
			const normalizedScopedTeams = (scopedTeams ?? [])
				.map((row: any) => {
					const id = String(row?.id ?? "").trim();
					const name = String(row?.name ?? "").trim();
					if (!id || !name) return null;
					return { id, name };
				})
				.filter(
					(row: { id: string; name: string } | null): row is { id: string; name: string } =>
						Boolean(row),
				);

			if (teams.length === 0) {
				teams = normalizedScopedTeams;
			} else {
				const merged = new Map(teams.map((team) => [team.id, team]));
				for (const team of normalizedScopedTeams) merged.set(team.id, team);
				teams = Array.from(merged.values());
			}
		}

		if (
			teams.length === 0 &&
			defaultWorkspaceId &&
			accessibleWorkspaceIds.includes(defaultWorkspaceId)
		) {
			const { data: defaultWorkspaceRows } = await readClient
				.from("workspaces")
				.select("id, name")
				.eq("id", defaultWorkspaceId)
				.limit(1);
			teams = (defaultWorkspaceRows ?? [])
				.map((row: any) => {
					const id = String(row?.id ?? "").trim();
					const name = String(row?.name ?? "").trim();
					if (!id || !name) return null;
					return { id, name };
				})
				.filter(
					(row: { id: string; name: string } | null): row is { id: string; name: string } =>
						Boolean(row),
				);
		}

		if (
			teams.length === 0 &&
			(userRole === "admin" || userRole === "editor")
		) {
			const { data: allWorkspaces } = await readClient
				.from("workspaces")
				.select("id, name");
			teams = (allWorkspaces ?? [])
				.map((row: any) => {
					const id = String(row?.id ?? "").trim();
					const name = String(row?.name ?? "").trim();
					if (!id || !name) return null;
					return { id, name };
				})
				.filter(
					(row: { id: string; name: string } | null): row is { id: string; name: string } =>
						Boolean(row),
				);
		}
	}

	let teamMembers: any[] = [];
	const usersById: Record<string, any> = {};
	if (userId && teams.length) {
		const workspaceIds = Array.from(new Set(teams.map((team) => team.id)));
		const memberReadClient: any = adminClient ?? readClient;

		if (workspaceIds.length) {
			const { data: memberRows } = await memberReadClient
				.from("workspace_members")
				.select("workspace_id, user_id, role")
				.in("workspace_id", workspaceIds);
			teamMembers = memberRows ?? [];

			const memberUserIds = Array.from(
				new Set((teamMembers ?? []).map((m: any) => m?.user_id).filter(Boolean)),
			);
			if (memberUserIds.length) {
				const { data: users } = await memberReadClient
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

	// Normalize
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

	const normalizedPreferredWorkspaceId = String(
		preferredWorkspaceId ?? "",
	).trim();
	const rawCookieWorkspaceId = String(
		(await getActiveWorkspaceIdFromCookieRaw()) ?? "",
	).trim();
	const resolvedCookieWorkspaceId = String(
		(await getWorkspaceIdFromCookie()) ?? "",
	).trim();
	const teamIds = new Set(teamsArray.map((team) => team.id));

	const initialTeamId =
		(normalizedPreferredWorkspaceId &&
		teamIds.has(normalizedPreferredWorkspaceId)
			? normalizedPreferredWorkspaceId
			: undefined) ||
		(rawCookieWorkspaceId && teamIds.has(rawCookieWorkspaceId)
			? rawCookieWorkspaceId
			: undefined) ||
		(resolvedCookieWorkspaceId && teamIds.has(resolvedCookieWorkspaceId)
			? resolvedCookieWorkspaceId
			: undefined) ||
		(defaultWorkspaceId && teamIds.has(defaultWorkspaceId)
			? defaultWorkspaceId
			: undefined) ||
		teamsArray[0]?.id;
	const manageableTeamIds = Object.entries(membersByTeam).reduce<string[]>(
		(acc, [workspaceId, members]) => {
			if (
				members?.some(
					(member: any) =>
						member?.user_id === userId &&
						["owner", "admin"].includes((member?.role ?? "").toLowerCase()),
				)
			) {
				acc.push(workspaceId);
			}
			return acc;
		},
		[],
	);
	for (const ownedWorkspaceId of ownedWorkspaceIds) {
		if (!manageableTeamIds.includes(ownedWorkspaceId)) {
			manageableTeamIds.push(ownedWorkspaceId);
		}
	}

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
	};
}

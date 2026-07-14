import { NextRequest, NextResponse } from "next/server";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsKeysInitialData = {
	currentUserId: string | undefined;
	initialWorkspaceId: string | null;
	teamsWithKeys: Array<{
		id: string;
		name: string;
		keys: any[];
	}>;
	workspaces: Array<{ id: string; name: string }>;
};

export async function GET(request: NextRequest) {
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

	const preferredWorkspaceId =
		request.nextUrl.searchParams.get("workspace_id") ?? undefined;
	const resolvedWorkspaceId = await getWorkspaceIdFromCookie();

	let membershipWorkspaceIds: string[] = [];
	let ownedWorkspaceIds: string[] = [];
	if (user?.id) {
		const { data: membershipRows } = await readClient
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", user.id);
		membershipWorkspaceIds = Array.from(
			new Set(
				(membershipRows ?? [])
					.map((row: any) => String(row?.workspace_id ?? "").trim())
					.filter(Boolean),
			),
		);

		const { data: ownedRows } = await readClient
			.from("workspaces")
			.select("id")
			.eq("owner_user_id", user.id);
		ownedWorkspaceIds = Array.from(
			new Set(
				(ownedRows ?? [])
					.map((row: any) => String(row?.id ?? "").trim())
					.filter(Boolean),
			),
		);
	}
	const accessibleWorkspaceIds = Array.from(
		new Set([...membershipWorkspaceIds, ...ownedWorkspaceIds]),
	);

	const { data: workspaceUsers } = await supabase
		.from("workspace_members")
		.select("workspace_id, workspaces(id, name)")
		.eq("user_id", user?.id);

	const workspaces: Array<{ id: string; name: string }> = [];
	const seenTeamIds = new Set<string>();
	for (const workspaceUser of workspaceUsers ?? []) {
		if (!workspaceUser?.workspaces) continue;
		const workspace = Array.isArray(workspaceUser.workspaces)
			? workspaceUser.workspaces[0]
			: workspaceUser.workspaces;
		const teamId = String(workspace?.id ?? "").trim();
		const teamName = String(workspace?.name ?? "").trim();
		if (!teamId || !teamName || seenTeamIds.has(teamId)) continue;
		seenTeamIds.add(teamId);
		workspaces.push({ id: teamId, name: teamName });
	}

	if (accessibleWorkspaceIds.length) {
		const { data: scopedTeams } = await readClient
			.from("workspaces")
			.select("id, name")
			.in("id", accessibleWorkspaceIds);
		for (const team of scopedTeams ?? []) {
			const teamId = String(team?.id ?? "").trim();
			const teamName = String(team?.name ?? "").trim();
			if (!teamId || !teamName || seenTeamIds.has(teamId)) continue;
			seenTeamIds.add(teamId);
			workspaces.push({ id: teamId, name: teamName });
		}
	}

	const initialWorkspaceCandidate =
		String(preferredWorkspaceId ?? "").trim() ||
		String(resolvedWorkspaceId ?? "").trim() ||
		"";
	const initialWorkspaceId =
		(initialWorkspaceCandidate &&
		workspaces.some((workspace) => workspace.id === initialWorkspaceCandidate)
			? initialWorkspaceCandidate
			: workspaces[0]?.id) ?? null;

	const apiKeys = initialWorkspaceId
		? (
				await supabase
					.from("keys")
					.select("*")
					.eq("workspace_id", initialWorkspaceId)
					.neq("status", "deleted")
					.neq("name", CHAT_MANAGED_KEY_NAME)
			).data
		: [];

	const usageByKey = new Map<
		string,
		{
			dailyRequests: number;
			weeklyRequests: number;
			monthlyRequests: number;
			dailyCostNanos: number;
			weeklyCostNanos: number;
			monthlyCostNanos: number;
			lastUsedAt: string | null;
		}
	>();
	if (initialWorkspaceId) {
		const dayStart = new Date();
		dayStart.setUTCHours(0, 0, 0, 0);
		const { data: usageRows, error: usageError } = await supabase.rpc(
			"get_workspace_key_usage",
			{
				p_workspace_id: initialWorkspaceId,
				p_day_start: dayStart.toISOString(),
			},
		);

		if (usageError) {
			console.error("[api/internal/settings/keys/initial] failed to load key usage", usageError);
		}

		for (const row of usageRows ?? []) {
			const keyId = typeof row?.key_id === "string" ? row.key_id : null;
			if (!keyId) continue;
			usageByKey.set(keyId, {
				dailyRequests: Number(row?.daily_request_count ?? 0) || 0,
				weeklyRequests: Number(row?.weekly_request_count ?? 0) || 0,
				monthlyRequests: Number(row?.monthly_request_count ?? 0) || 0,
				dailyCostNanos: Number(row?.daily_cost_nanos ?? 0) || 0,
				weeklyCostNanos: Number(row?.weekly_cost_nanos ?? 0) || 0,
				monthlyCostNanos: Number(row?.monthly_cost_nanos ?? 0) || 0,
				lastUsedAt:
					typeof row?.last_used_at === "string" ? row.last_used_at : null,
			});
		}
	}

	const keysArray = (apiKeys ?? []).map((key: any) => {
		const usage = usageByKey.get(key.id) ?? {
			dailyRequests: 0,
			weeklyRequests: 0,
			monthlyRequests: 0,
			dailyCostNanos: 0,
			weeklyCostNanos: 0,
			monthlyCostNanos: 0,
			lastUsedAt: null,
		};
		return {
			...key,
			current_usage_daily: usage.dailyRequests,
			current_usage_weekly: usage.weeklyRequests,
			current_usage_monthly: usage.monthlyRequests,
			current_usage_daily_cost_nanos: usage.dailyCostNanos,
			current_usage_weekly_cost_nanos: usage.weeklyCostNanos,
			current_usage_monthly_cost_nanos: usage.monthlyCostNanos,
			last_used_at:
				typeof key?.last_used_at === "string" && key.last_used_at.length > 0
					? key.last_used_at
					: usage.lastUsedAt,
		};
	});

	const activeTeam = workspaces.find((team) => team.id === initialWorkspaceId);
	const teamsWithKeys = activeTeam ? [{ ...activeTeam, keys: keysArray }] : [];

	return NextResponse.json({
		currentUserId: user?.id,
		initialWorkspaceId,
		teamsWithKeys,
		workspaces,
	} satisfies SettingsKeysInitialData);
}

import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import CreateKeyDialog from "@/components/(gateway)/settings/keys/CreateKeyDialog";
import KeysPanel from "@/components/(gateway)/settings/keys/KeysPanel";
import {
	getActiveWorkspaceIdFromCookieRaw,
	getWorkspaceIdFromCookie,
} from "@/utils/workspaceCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Button } from "@/components/ui/button";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";

const QUICKSTART_DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

export const metadata = {
	title: "API Keys - Settings",
};

export default function KeysPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<KeysContent searchParams={props.searchParams} />
			</Suspense>
		</div>
	);
}

async function KeysContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

	const sp = await searchParams;
	const preferredWorkspaceId =
		typeof sp?.workspace_id === "string"
			? sp.workspace_id
			: Array.isArray(sp?.workspace_id)
				? sp?.workspace_id?.[0]
				: undefined;
	const rawCookieWorkspaceId = await getActiveWorkspaceIdFromCookieRaw();
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

	const { data: teamUsers } = await supabase
		.from("workspace_members")
		.select("workspace_id, teams:workspaces(id, name)")
		.eq("user_id", user?.id);

	const teams: Array<{ id: string; name: string }> = [];
	const seenTeamIds = new Set<string>();
	for (const tu of teamUsers ?? []) {
		if (!tu?.teams) continue;
		const team = Array.isArray(tu.teams) ? tu.teams[0] : tu.teams;
		const teamId = String(team?.id ?? "").trim();
		const teamName = String(team?.name ?? "").trim();
		if (!teamId || !teamName || seenTeamIds.has(teamId)) continue;
		seenTeamIds.add(teamId);
		teams.push({ id: teamId, name: teamName });
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
			teams.push({ id: teamId, name: teamName });
		}
	}

	const initialTeamCandidate =
		String(preferredWorkspaceId ?? "").trim() ||
		String(rawCookieWorkspaceId ?? "").trim() ||
		String(resolvedWorkspaceId ?? "").trim() ||
		"";
	const initialTeamId =
		(initialTeamCandidate && teams.some((team) => team.id === initialTeamCandidate)
			? initialTeamCandidate
			: teams[0]?.id) ?? null;

	const apiKeys = initialTeamId
		? (
				await supabase
					.from("keys")
					.select("*")
					.eq("workspace_id", initialTeamId)
					.neq("status", "deleted")
					.neq("name", CHAT_MANAGED_KEY_NAME)
		  ).data
		: [];

	const usageByKey = new Map<
		string,
		{ requests: number; costNanos: number; lastUsedAt: string | null }
	>();
	if (initialTeamId) {
		const dayStart = new Date();
		dayStart.setUTCHours(0, 0, 0, 0);
		const dayStartIso = dayStart.toISOString();

		const { data: usageRows, error: usageError } = await supabase.rpc(
			"get_workspace_key_usage",
			{
				p_workspace_id: initialTeamId,
				p_day_start: dayStartIso,
			},
		);

		if (usageError) {
			console.error("[settings/keys] failed to load key usage", usageError);
		}

		for (const row of usageRows ?? []) {
			const keyId = typeof row?.key_id === "string" ? row.key_id : null;
			if (!keyId) continue;
			usageByKey.set(keyId, {
				requests: Number(row?.daily_request_count ?? 0) || 0,
				costNanos: Number(row?.daily_cost_nanos ?? 0) || 0,
				lastUsedAt:
					typeof row?.last_used_at === "string" ? row.last_used_at : null,
			});
		}
	}

	const keysArray = (apiKeys ?? []).map((k: any) => {
		const usage = usageByKey.get(k.id) ?? {
			requests: 0,
			costNanos: 0,
			lastUsedAt: null,
		};
		return {
			...k,
			current_usage_daily: usage.requests,
			current_usage_daily_cost_nanos: usage.costNanos,
			last_used_at:
				typeof k?.last_used_at === "string" && k.last_used_at.length > 0
					? k.last_used_at
					: usage.lastUsedAt,
		};
	});

	const activeTeam = teams.find((t) => t.id === initialTeamId);
	const teamsWithKeys = activeTeam ? [{ ...activeTeam, keys: keysArray }] : [];

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="API Keys"
				description="Create and manage gateway API keys for this workspace."
				actions={
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link
								href={QUICKSTART_DOCS_HREF}
								target="_blank"
								rel="noreferrer"
							>
								Quick start
								<ArrowUpRight className="ml-1 h-4 w-4" />
							</Link>
						</Button>
						<CreateKeyDialog
							currentUserId={user?.id}
							currentTeamId={initialTeamId}
							teams={teams}
						/>
					</div>
				}
			/>
			<KeysPanel
				teamsWithKeys={teamsWithKeys}
				initialTeamId={initialTeamId}
				currentUserId={user?.id}
			/>
		</div>
	);
}

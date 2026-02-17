import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import CreateKeyDialog from "@/components/(gateway)/settings/keys/CreateKeyDialog";
import KeysPanel from "@/components/(gateway)/settings/keys/KeysPanel";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export const metadata = {
	title: "API Keys - Settings",
};

export default function KeysPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<KeysContent />
			</Suspense>
		</div>
	);
}

async function KeysContent() {
	const supabase = await createClient();

	// get current user
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const initialTeamId = await getTeamIdFromCookie();

	// fetch API keys for the active team
	const { data: apiKeys } = await supabase
		.from("keys")
		.select("*")
		.eq("team_id", initialTeamId);

	const usageByKey = new Map<
		string,
		{ requests: number; costNanos: number; lastUsedAt: string | null }
	>();
	if (initialTeamId) {
		const dayStart = new Date();
		dayStart.setUTCHours(0, 0, 0, 0);
		const dayStartIso = dayStart.toISOString();

		const { data: usageRows, error: usageError } = await supabase.rpc(
			"get_team_key_usage",
			{
				p_team_id: initialTeamId,
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
				lastUsedAt: typeof row?.last_used_at === "string" ? row.last_used_at : null,
			});
		}
	}

	// fetch teams the user belongs to (assumes a `team_users` join table)
	const { data: teamUsers } = await supabase
		.from("team_members")
		.select("team_id, teams(id, name)")
		.eq("user_id", user?.id);

	// build a teams list including a personal/personal-like fallback
	const teams: any[] = [];

	if (teamUsers) {
		for (const tu of teamUsers) {
			if (tu?.teams) {
				const team = Array.isArray(tu.teams) ? tu.teams[0] : tu.teams;
				if (team?.id && team?.name) {
					teams.push({ id: team.id, name: team.name });
				}
			}
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

	// find the active team
	const activeTeam = teams.find((t) => t.id === initialTeamId);

	const teamsWithKeys = activeTeam ? [{ ...activeTeam, keys: keysArray }] : [];

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="API Keys"
				description="Create and manage gateway API keys for this team."
				actions={
					<CreateKeyDialog
						currentUserId={user?.id}
						currentTeamId={initialTeamId}
						teams={teams}
					/>
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

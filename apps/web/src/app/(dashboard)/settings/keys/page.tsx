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
	const { data: apiKeys } = await supabase.from("keys").select("*").eq("team_id", initialTeamId);

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

	const keysArray = (apiKeys ?? []).map((k: any) => ({ ...k, last_used_at: null, current_usage_daily: 0 }));

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

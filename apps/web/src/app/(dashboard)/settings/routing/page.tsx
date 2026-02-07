import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import RoutingSettingsClient from "@/components/(gateway)/settings/routing/RoutingSettingsClient";

export const metadata = {
	title: "Routing - Settings",
};

export default async function RoutingSettingsPage() {
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
		return (
			<div>
				<h1 className="text-2xl font-bold">Routing</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Select a team to manage routing preferences.
				</p>
			</div>
		);
	}

	const [{ data: teamRow }, { data: settingsRow }] = await Promise.all([
		supabase.from("teams").select("id, name").eq("id", teamId).maybeSingle(),
		supabase
			.from("team_settings")
			.select("routing_mode, beta_channel_enabled")
			.eq("team_id", teamId)
			.maybeSingle(),
	]);
	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-bold">Routing</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Tune how the Gateway balances cost, latency, and throughput when
					selecting providers.
				</p>
			</header>
			<RoutingSettingsClient
				initialMode={(settingsRow?.routing_mode as any) ?? "balanced"}
				initialBetaChannelEnabled={Boolean(
					settingsRow?.beta_channel_enabled,
				)}
				teamName={teamRow?.name ?? null}
			/>
		</div>
	);
}

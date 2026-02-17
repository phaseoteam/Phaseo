import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastSettingsClient from "@/components/(gateway)/settings/observability/BroadcastSettingsClient";

export const metadata = {
	title: "Broadcast - Settings",
};

export default async function BroadcastSettingsPage() {
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
						Broadcast
					</h1>
				</div>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastSettingsContent />
			</Suspense>
		</main>
	);
}

async function BroadcastSettingsContent() {
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a team to manage broadcast settings.
			</div>
		);
	}

	const teamResult = await supabase
		.from("teams")
		.select("id, name")
		.eq("id", teamId)
		.maybeSingle();
	const configuredResult = await supabase
		.from("team_broadcast_destinations")
		.select(
			"id, destination_id, name, enabled, sampling_rate, destination_config, updated_at",
		)
		.eq("team_id", teamId)
		.order("created_at", { ascending: false });

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (
		configuredResult.error &&
		!configuredResult.error.message.includes(
			"Could not find the table 'public.team_broadcast_destinations'",
		)
	) {
		throw new Error(configuredResult.error.message);
	}

	const configuredDestinations = (configuredResult.data ?? []).map((row: any) => ({
		id: row.id as string,
		destinationId: row.destination_id as string,
		name: row.name as string,
		enabled: Boolean(row.enabled),
		samplingRate: Number(row.sampling_rate ?? 1),
		destinationConfig: (row.destination_config ?? null) as Record<string, unknown> | null,
		updatedAt: (row.updated_at as string | null) ?? null,
	}));

	return (
		<BroadcastSettingsClient
			teamName={teamResult.data?.name ?? null}
			configuredDestinations={configuredDestinations}
		/>
	);
}

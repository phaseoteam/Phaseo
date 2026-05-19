import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import RoutingSettingsClient from "@/components/(gateway)/settings/routing/RoutingSettingsClient";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = {
	title: "Routing - Settings",
};

export default function RoutingSettingsPage() {
	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-bold">Routing</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Tune how the Gateway balances cost, latency, and throughput when
					selecting providers.
				</p>
			</header>
			<Suspense fallback={<SettingsSectionFallback />}>
				<RoutingSettingsContent />
			</Suspense>
		</div>
	);
}

async function RoutingSettingsContent() {
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage routing preferences.
			</div>
		);
	}

	const [{ data: teamRow }, { data: settingsRow }] = await Promise.all([
		supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle(),
		supabase
			.from("workspace_settings")
			.select(
				"routing_mode, beta_channel_enabled, alpha_channel_enabled, response_healing_enabled, response_healing_locked, response_healing_mode",
			)
			.eq("workspace_id", workspaceId)
			.maybeSingle(),
	]);

	return (
		<RoutingSettingsClient
			initialMode={(settingsRow?.routing_mode as any) ?? "balanced"}
			initialBetaChannelEnabled={Boolean(settingsRow?.beta_channel_enabled)}
			initialAlphaChannelEnabled={Boolean(settingsRow?.alpha_channel_enabled)}
			initialResponseHealingEnabled={Boolean(settingsRow?.response_healing_enabled)}
			initialResponseHealingLocked={Boolean(settingsRow?.response_healing_locked)}
			initialResponseHealingMode={
				settingsRow?.response_healing_mode === "strict" ? "strict" : "safe"
			}
			teamName={teamRow?.name ?? null}
		/>
	);
}

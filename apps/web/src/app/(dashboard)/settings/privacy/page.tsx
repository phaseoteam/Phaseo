import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import PrivacySettingsClient from "@/components/(gateway)/settings/privacy/PrivacySettingsClient";

export const metadata = {
	title: "Privacy - Settings",
};

export default function PrivacySettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Privacy"
				description="Configure privacy defaults and provider restrictions for your team."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<PrivacySettingsContent />
			</Suspense>
		</div>
	);
}

async function PrivacySettingsContent() {
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a team to manage privacy settings.
			</div>
		);
	}

	const [teamResult, settingsResult, providersResult, activeProviderModelsResult] =
		await Promise.all([
			supabase.from("teams").select("id, name").eq("id", teamId).maybeSingle(),
			supabase
				.from("team_settings")
				.select(
					"privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_free_may_publish_prompts,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed",
				)
				.eq("team_id", teamId)
				.maybeSingle(),
			supabase
				.from("data_api_providers")
				.select("api_provider_id, api_provider_name")
				.order("api_provider_name", { ascending: true }),
			supabase
				.from("data_api_provider_models")
				.select("provider_id, api_model_id, internal_model_id, is_active_gateway")
				.eq("is_active_gateway", true),
		]);

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (providersResult.error) throw new Error(providersResult.error.message);
	if (activeProviderModelsResult.error) {
		throw new Error(activeProviderModelsResult.error.message);
	}

	return (
		<PrivacySettingsClient
			teamName={teamResult.data?.name ?? null}
			initialGlobal={settingsResult.data ?? null}
			providers={(providersResult.data ?? []).map((p: any) => ({
				id: p.api_provider_id as string,
				name: (p.api_provider_name as string) ?? (p.api_provider_id as string),
			}))}
			activeProviderModels={(activeProviderModelsResult.data ?? []).map((row: any) => ({
				providerId: row.provider_id as string,
				apiModelId: row.api_model_id as string,
				internalModelId: (row.internal_model_id as string | null) ?? null,
			}))}
		/>
	);
}


import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import GuardrailsSettingsClient from "@/components/(gateway)/settings/guardrails/GuardrailsSettingsClient";

export const metadata = {
	title: "Guardrails - Settings",
};

export default function GuardrailsSettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Guardrails"
				description="Create per-key guardrails: budgets, provider/model restrictions, and ZDR rules."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<GuardrailsSettingsContent />
			</Suspense>
		</div>
	);
}

async function GuardrailsSettingsContent() {
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a team to manage guardrails.
			</div>
		);
	}

	const [
		teamResult,
		providersResult,
		activeProviderModelsResult,
		keysResult,
		guardrailsResult,
	] = await Promise.all([
		supabase.from("teams").select("id, name").eq("id", teamId).maybeSingle(),
		supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name")
			.order("api_provider_name", { ascending: true }),
		supabase
			.from("data_api_provider_models")
			.select("provider_id, api_model_id, internal_model_id, is_active_gateway")
			.eq("is_active_gateway", true),
		supabase
			.from("keys")
			.select("id, name, prefix, status, created_at")
			.eq("team_id", teamId)
			.order("created_at", { ascending: false }),
		supabase
			.from("team_guardrails")
			.select(
				"id, team_id, enabled, name, description, privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging, privacy_zdr_only, provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed, allowed_api_model_ids, daily_limit_requests, weekly_limit_requests, monthly_limit_requests, daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos, created_at, updated_at",
			)
			.eq("team_id", teamId)
			.order("created_at", { ascending: false }),
	]);

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (providersResult.error) throw new Error(providersResult.error.message);
	if (activeProviderModelsResult.error) {
		throw new Error(activeProviderModelsResult.error.message);
	}
	if (keysResult.error) throw new Error(keysResult.error.message);
	if (guardrailsResult.error) throw new Error(guardrailsResult.error.message);

	const guardrails = guardrailsResult.data ?? [];
	const guardrailIds = guardrails.map((g: any) => g.id).filter(Boolean);

	const guardrailKeysMap = new Map<string, string[]>();
	if (guardrailIds.length) {
		const { data: mappingRows, error: mappingErr } = await supabase
			.from("key_guardrails")
			.select("guardrail_id, key_id")
			.in("guardrail_id", guardrailIds);
		if (mappingErr) throw new Error(mappingErr.message);
		for (const row of mappingRows ?? []) {
			const gid = (row as any).guardrail_id as string | null;
			const kid = (row as any).key_id as string | null;
			if (!gid || !kid) continue;
			const next = guardrailKeysMap.get(gid) ?? [];
			next.push(kid);
			guardrailKeysMap.set(gid, next);
		}
	}

	return (
		<GuardrailsSettingsClient
			providers={(providersResult.data ?? []).map((p: any) => ({
				id: p.api_provider_id as string,
				name: (p.api_provider_name as string) ?? (p.api_provider_id as string),
			}))}
			activeProviderModels={(activeProviderModelsResult.data ?? []).map((row: any) => ({
				providerId: row.provider_id as string,
				apiModelId: row.api_model_id as string,
				internalModelId: (row.internal_model_id as string | null) ?? null,
			}))}
			keys={(keysResult.data ?? []).map((k: any) => ({
				id: k.id as string,
				name: k.name as string,
				prefix: k.prefix as string,
				status: k.status as string,
			}))}
			guardrails={guardrails as any}
			guardrailKeyIdsByGuardrailId={Object.fromEntries(guardrailKeysMap)}
		/>
	);
}


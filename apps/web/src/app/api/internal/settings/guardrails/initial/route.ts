import { NextResponse } from "next/server";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsGuardrailsInitialData = {
	activeProviderModels: Array<{
		apiModelId: string;
		internalModelId: string | null;
		providerId: string;
	}>;
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
	guardrails: any[];
	keys: Array<{
		id: string;
		name: string;
		prefix: string;
		status: string;
	}>;
	providers: Array<{
		id: string;
		name: string;
	}>;
	workspaceId: string | null;
};

export async function GET() {
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({
			activeProviderModels: [],
			guardrailKeyIdsByGuardrailId: {},
			guardrails: [],
			keys: [],
			providers: [],
			workspaceId: null,
		} satisfies SettingsGuardrailsInitialData);
	}

	const [
		teamResult,
		providersResult,
		activeProviderModelsResult,
		keysResult,
		guardrailsResult,
	] = await Promise.all([
		supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle(),
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
			.eq("workspace_id", workspaceId)
			.neq("status", "deleted")
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.order("created_at", { ascending: false }),
		supabase
			.from("workspace_guardrails")
			.select(
				"id, workspace_id, enabled, name, description, privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging, privacy_zdr_only, provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed, model_restriction_mode, allowed_api_model_ids, prompt_injection_enabled, prompt_injection_action, sensitive_info_enabled, sensitive_info_default_action, sensitive_info_rules, daily_limit_requests, weekly_limit_requests, monthly_limit_requests, daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos, created_at, updated_at",
			)
			.eq("workspace_id", workspaceId)
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
	const guardrailIds = guardrails.map((guardrail: any) => guardrail.id).filter(Boolean);

	const guardrailKeysMap = new Map<string, string[]>();
	if (guardrailIds.length) {
		const { data: mappingRows, error: mappingError } = await supabase
			.from("key_guardrails")
			.select("guardrail_id, key_id")
			.in("guardrail_id", guardrailIds);
		if (mappingError) throw new Error(mappingError.message);
		for (const row of mappingRows ?? []) {
			const guardrailId = (row as any).guardrail_id as string | null;
			const keyId = (row as any).key_id as string | null;
			if (!guardrailId || !keyId) continue;
			const next = guardrailKeysMap.get(guardrailId) ?? [];
			next.push(keyId);
			guardrailKeysMap.set(guardrailId, next);
		}
	}

	return NextResponse.json({
		activeProviderModels: (activeProviderModelsResult.data ?? []).map((row: any) => ({
			apiModelId: row.api_model_id as string,
			internalModelId: (row.internal_model_id as string | null) ?? null,
			providerId: row.provider_id as string,
		})),
		guardrailKeyIdsByGuardrailId: Object.fromEntries(guardrailKeysMap),
		guardrails: guardrails as any[],
		keys: (keysResult.data ?? []).map((key: any) => ({
			id: key.id as string,
			name: key.name as string,
			prefix: key.prefix as string,
			status: key.status as string,
		})),
		providers: (providersResult.data ?? []).map((provider: any) => ({
			id: provider.api_provider_id as string,
			name: (provider.api_provider_name as string) ?? (provider.api_provider_id as string),
		})),
		workspaceId,
	} satisfies SettingsGuardrailsInitialData);
}

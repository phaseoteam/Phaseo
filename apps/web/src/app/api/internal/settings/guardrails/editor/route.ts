import { NextRequest, NextResponse } from "next/server";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

type ProviderOption = { id: string; name: string };
type ActiveProviderModel = {
	providerId: string;
	apiModelId: string;
	internalModelId: string | null;
	internalModelName?: string | null;
	organisationId?: string | null;
	organisationName?: string | null;
};
type KeyOption = { id: string; name: string; prefix: string; status: string };

export type SettingsGuardrailEditorData = {
	activeProviderModels: ActiveProviderModel[];
	guardrail: any | null;
	initialKeyIds: string[];
	keys: KeyOption[];
	mode: "create" | "edit";
	providers: ProviderOption[];
	teamName: string | null;
	workspaceId: string | null;
};

const EMPTY_EDITOR_DATA: SettingsGuardrailEditorData = {
	activeProviderModels: [],
	guardrail: null,
	initialKeyIds: [],
	keys: [],
	mode: "create",
	providers: [],
	teamName: null,
	workspaceId: null,
};

export async function GET(request: NextRequest) {
	const mode =
		request.nextUrl.searchParams.get("mode") === "edit" ? "edit" : "create";
	const guardrailId = request.nextUrl.searchParams.get("guardrailId")?.trim();
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({
			...EMPTY_EDITOR_DATA,
			mode,
		} satisfies SettingsGuardrailEditorData);
	}

	const [
		teamResult,
		keysResult,
		providersResult,
		activeProviderModelsResult,
		guardrailResult,
	] = await Promise.all([
		supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle(),
		supabase
			.from("keys")
			.select("id, name, prefix, status, created_at")
			.eq("workspace_id", workspaceId)
			.neq("status", "deleted")
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.order("created_at", { ascending: false }),
		supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name")
			.order("api_provider_name", { ascending: true }),
		supabase
			.from("data_api_provider_models")
			.select("provider_id, api_model_id, internal_model_id, is_active_gateway")
			.eq("is_active_gateway", true),
		mode === "edit" && guardrailId
			? supabase
					.from("workspace_guardrails")
					.select(
						"id, workspace_id, enabled, name, description, privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging, privacy_zdr_only, provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed, model_restriction_mode, allowed_api_model_ids, prompt_injection_enabled, prompt_injection_action, sensitive_info_enabled, sensitive_info_default_action, sensitive_info_rules, daily_limit_requests, weekly_limit_requests, monthly_limit_requests, daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos, created_at, updated_at",
					)
					.eq("workspace_id", workspaceId)
					.eq("id", guardrailId)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null } as any),
	]);

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (keysResult.error) throw new Error(keysResult.error.message);
	if (providersResult.error) throw new Error(providersResult.error.message);
	if (activeProviderModelsResult.error) {
		throw new Error(activeProviderModelsResult.error.message);
	}
	if (guardrailResult.error) throw new Error(guardrailResult.error.message);

	const guardrail = guardrailResult.data ?? null;
	let initialKeyIds: string[] = [];
	if (mode === "edit" && guardrail?.id) {
		const { data: mappingRows, error: mappingErr } = await supabase
			.from("key_guardrails")
			.select("key_id")
			.eq("guardrail_id", guardrail.id);
		if (mappingErr) throw new Error(mappingErr.message);
		initialKeyIds = (mappingRows ?? [])
			.map((row: any) => row.key_id as string)
			.filter(Boolean);
	}

	return NextResponse.json({
		activeProviderModels: (activeProviderModelsResult.data ?? []).map((row: any) => ({
			apiModelId: row.api_model_id as string,
			internalModelId: (row.internal_model_id as string | null) ?? null,
			providerId: row.provider_id as string,
		})),
		guardrail,
		initialKeyIds,
		keys: (keysResult.data ?? []).map((key: any) => ({
			id: key.id as string,
			name: key.name as string,
			prefix: key.prefix as string,
			status: key.status as string,
		})),
		mode,
		providers: (providersResult.data ?? []).map((provider: any) => ({
			id: provider.api_provider_id as string,
			name: (provider.api_provider_name as string) ?? (provider.api_provider_id as string),
		})),
		teamName: teamResult.data?.name ?? null,
		workspaceId,
	} satisfies SettingsGuardrailEditorData);
}

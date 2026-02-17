import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import GuardrailEditorPageClient from "./GuardrailEditorPageClient";

type ProviderOption = { id: string; name: string };
type ActiveProviderModel = {
	providerId: string;
	apiModelId: string;
	internalModelId: string | null;
};
type KeyOption = { id: string; name: string; prefix: string; status: string };

export default async function GuardrailEditorPage(props: {
	mode: "create" | "edit";
	guardrailId?: string;
}) {
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
		keysResult,
		providersResult,
		activeProviderModelsResult,
		guardrailResult,
	] = await Promise.all([
		supabase.from("teams").select("id, name").eq("id", teamId).maybeSingle(),
		supabase
			.from("keys")
			.select("id, name, prefix, status, created_at")
			.eq("team_id", teamId)
			.order("created_at", { ascending: false }),
		supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name")
			.order("api_provider_name", { ascending: true }),
		supabase
			.from("data_api_provider_models")
			.select("provider_id, api_model_id, internal_model_id, is_active_gateway")
			.eq("is_active_gateway", true),
		props.mode === "edit" && props.guardrailId
			? supabase
					.from("team_guardrails")
					.select(
						"id, team_id, enabled, name, description, privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging, privacy_zdr_only, provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed, allowed_api_model_ids, daily_limit_requests, weekly_limit_requests, monthly_limit_requests, daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos, created_at, updated_at",
					)
					.eq("team_id", teamId)
					.eq("id", props.guardrailId)
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
	if (props.mode === "edit" && guardrail?.id) {
		const { data: mappingRows, error: mappingErr } = await supabase
			.from("key_guardrails")
			.select("key_id")
			.eq("guardrail_id", guardrail.id);
		if (mappingErr) throw new Error(mappingErr.message);
		initialKeyIds = (mappingRows ?? [])
			.map((r: any) => r.key_id as string)
			.filter(Boolean);
	}

	if (props.mode === "edit" && !guardrail) {
		return (
			<div className="rounded-xl border bg-muted/10 p-6 text-sm text-muted-foreground">
				Guardrail not found.{" "}
				<Link className="underline underline-offset-4" href="/settings/guardrails">
					Back to guardrails
				</Link>
				.
			</div>
		);
	}

	const providers: ProviderOption[] = (providersResult.data ?? []).map((p: any) => ({
		id: p.api_provider_id as string,
		name: (p.api_provider_name as string) ?? (p.api_provider_id as string),
	}));

	const activeProviderModels: ActiveProviderModel[] = (activeProviderModelsResult.data ?? []).map(
		(row: any) => ({
			providerId: row.provider_id as string,
			apiModelId: row.api_model_id as string,
			internalModelId: (row.internal_model_id as string | null) ?? null,
		}),
	);

	const keys: KeyOption[] = (keysResult.data ?? []).map((k: any) => ({
		id: k.id as string,
		name: k.name as string,
		prefix: k.prefix as string,
		status: k.status as string,
	}));

	return (
		<GuardrailEditorPageClient
			mode={props.mode}
			guardrailId={props.guardrailId ?? null}
			teamName={teamResult.data?.name ?? null}
			providers={providers}
			activeProviderModels={activeProviderModels}
			keys={keys}
			initialGuardrail={guardrail}
			initialKeyIds={initialKeyIds}
			backHref="/settings/guardrails"
		/>
	);
}


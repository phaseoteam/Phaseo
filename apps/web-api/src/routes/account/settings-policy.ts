import { Hono, type Context } from "hono";
import { invalidateWorkspaceGatewayContext } from "./gateway-invalidation";
import { compilePromptTemplate, type PromptTemplateIssue } from "./prompt-templates";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { SLACK_AGENT_MANAGED_KEY_NAME } from "@/lib/managed-keys";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import { purgeWorkerCacheTags } from "@/http/invalidation";
import {
	AUTO_ROUTING_COLUMNS,
	MAX_SUCCESSOR_PRICE_INCREASE_PERCENT,
	MAX_SUCCESSOR_REPLACEMENTS,
	autoRoutingFromRow,
	parseAutoRoutingUpdate,
	parseSuccessorReplacement,
	parseSuccessorSettings,
	successorModelSlug,
	successorReplacementCatalogueError,
	successorSettingsFromRow,
} from "./workspace-routing-settings";
import { successorOverviewFromRows } from "./successor-overview";

const GUARDRAIL_COLUMNS = "id,workspace_id,kind,is_workspace_baseline,enabled,name,description,privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_free_may_publish_prompts,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed,model_restriction_mode,allowed_api_model_ids,prompt_injection_enabled,prompt_injection_action,sensitive_info_enabled,sensitive_info_default_action,sensitive_info_rules,rate_requests_per_minute,rate_tokens_per_minute,rate_concurrent_requests,rate_fail_closed,rate_counting,created_at,updated_at";

function accountPolicyFromRow(row: any) {
	const mode = (value: unknown) => value === "allowlist" || value === "blocklist" ? value : "none";
	const ids = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
	return {
		privacyEnablePaidMayTrain: row?.privacy_enable_paid_may_train !== false,
		privacyEnableFreeMayTrain: row?.privacy_enable_free_may_train !== false,
		privacyEnableInputOutputLogging: row?.privacy_enable_input_output_logging !== false,
		privacyZdrOnly: row?.privacy_zdr_only === true,
		providerRestrictionMode: mode(row?.provider_restriction_mode),
		providerRestrictionProviderIds: ids(row?.provider_restriction_provider_ids),
		modelRestrictionMode: mode(row?.model_restriction_mode),
		modelRestrictionModelIds: ids(row?.model_restriction_model_ids),
	};
}

const REFERENCE_PAGE_SIZE = 500;
const PRESET_DETAIL_COLUMNS = "id,workspace_id,name,description,config,created_by,created_at,updated_at,visibility,source_preset_id,slug,draft_name,draft_slug,draft_description,draft_config,draft_visibility,active_version_id,source_preset_version_id,upstream_version_id,root_preset_id,fork_depth,versioning_method";

/** Reads every page of an ordered query; PostgREST caps one response without reporting that rows were left out. */
async function readAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ data: T[]; error: unknown }> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += REFERENCE_PAGE_SIZE) {
		const result = await page(offset, offset + REFERENCE_PAGE_SIZE - 1);
		if (result.error) return { data: rows, error: result.error };
		rows.push(...(result.data ?? []));
		if ((result.data?.length ?? 0) < REFERENCE_PAGE_SIZE) return { data: rows, error: null };
	}
}

async function loadGuardrailReference(context: AccountWorkspaceContext) {
	const [teamResult, keysResult, membersResult, providersResult, modelsResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", context.workspaceId).maybeSingle(),
		readAllPages((from, to) => context.client.from("keys").select("id,name,prefix,status,created_at,created_by,oauth_user_id")
			.eq("workspace_id", context.workspaceId).neq("status", "deleted")
			.neq("name", "__chat_route_managed_key__").neq("name", SLACK_AGENT_MANAGED_KEY_NAME)
			.order("created_at", { ascending: false }).order("id").range(from, to)),
		readAllPages((from, to) => context.client.from("workspace_members").select("user_id,role,users(display_name)")
			.eq("workspace_id", context.workspaceId).order("user_id").range(from, to)),
		context.client.from("v2_providers")
			.select("api_provider_id:provider_slug,api_provider_name:name,provider_family_id:provider_family_slug,offer_label,offer_scope,zero_data_retention,data_policy_tier,data_policy_confidence")
			.eq("routable", true)
			.eq("routing_enabled", true)
			.in("status", ["active", "degraded"])
			.order("name", { ascending: true }),
		context.client.from("v2_model_provider_routes").select("provider_model_id,provider_id:provider_slug,api_model_id:model_slug,internal_model_id:model_slug,is_active_gateway:routing_enabled").eq("routing_enabled", true).in("status", ["active", "degraded"]),
	]);
	if ([teamResult, keysResult, membersResult, providersResult, modelsResult].some((result) => result.error)) throw new Error("settings_unavailable");
	const modelSlugs = Array.from(new Set((modelsResult.data ?? []).map((row) => String(row.api_model_id ?? "").trim()).filter(Boolean)));
	const modelMetadataResult = modelSlugs.length
		? await context.client.from("v2_models").select("model_slug,name,lab_slug,organisation:v2_labs(lab_slug,name)").in("model_slug", modelSlugs)
		: { data: [], error: null };
	if (modelMetadataResult.error) throw new Error("settings_unavailable");
	const providerModelIds = Array.from(new Set((modelsResult.data ?? [])
		.map((row) => String(row.provider_model_id ?? "").trim()).filter(Boolean)));
	const capabilityRows: Array<{ provider_model_id: string; capability_id: string; metadata: Record<string, unknown> | null }> = [];
	// Bound URL size and page below PostgREST's row cap so scoped policies are not truncated.
	for (let index = 0; index < providerModelIds.length; index += 100) {
		const batch = providerModelIds.slice(index, index + 100);
		for (let offset = 0; ; offset += 500) {
			const result = await context.client.from("v2_effective_route_capabilities")
				.select("provider_model_id,capability_id,status,metadata")
				.in("provider_model_id", batch)
				.or("metadata->data_policy.not.is.null,capability_id.in.(batch,files.upload,files.list,files.retrieve)")
				.in("status", ["active", "degraded"])
				.order("provider_model_id").order("capability_id")
				.range(offset, offset + 499);
			if (result.error) throw new Error("settings_unavailable");
			capabilityRows.push(...(result.data ?? []));
			if ((result.data?.length ?? 0) < 500) break;
		}
	}
	const modelMetadata = new Map((modelMetadataResult.data ?? []).map((row: any) => [String(row.model_slug), row]));
	const capabilitiesByProviderModel = new Map<string, Array<{ id: string; dataPolicy: Record<string, unknown> | null }>>();
	for (const row of capabilityRows) {
		const providerModelId = String(row.provider_model_id ?? "").trim();
		const capabilityId = String(row.capability_id ?? "").trim();
		if (!providerModelId || !capabilityId) continue;
		const dataPolicy = row.metadata?.data_policy && typeof row.metadata.data_policy === "object"
			? row.metadata.data_policy as Record<string, unknown>
			: null;
		capabilitiesByProviderModel.set(providerModelId, [
			...(capabilitiesByProviderModel.get(providerModelId) ?? []),
			{ id: capabilityId, dataPolicy },
		]);
	}
	const providerPolicies = new Map((providersResult.data ?? []).map((provider: any) => [String(provider.api_provider_id), {
		zeroDataRetention: provider.zero_data_retention === true,
		dataPolicyTier: provider.data_policy_tier ?? "unknown",
		dataPolicyConfidence: provider.data_policy_confidence ?? "unknown",
	}]));
	const routableProviderIds = new Set((modelsResult.data ?? []).map((row) => String(row.provider_id ?? "")).filter(Boolean));
	return {
		activeProviderModels: (modelsResult.data ?? []).map((row) => {
			const metadata: any = modelMetadata.get(String(row.api_model_id)) ?? null;
			const providerPolicy = providerPolicies.get(String(row.provider_id));
			return {
				apiModelId: row.api_model_id,
				internalModelId: row.internal_model_id ?? null,
				internalModelName: metadata?.name ?? null,
				organisationId: metadata?.organisation?.lab_slug ?? metadata?.lab_slug ?? null,
				organisationName: metadata?.organisation?.name ?? null,
				providerId: row.provider_id,
				providerPolicy,
				capabilities: capabilitiesByProviderModel.get(String((row as any).provider_model_id)) ?? [],
			};
		}),
		// The gateway applies the member guardrails of this user to the key, so the assignments view shows them as inherited.
		keys: (keysResult.data ?? []).map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, status: key.status, principalUserId: key.oauth_user_id ?? key.created_by ?? null })),
		members: (membersResult.data ?? []).map((member: any) => ({
			id: member.user_id,
			name: member.users?.display_name ?? "Workspace member",
			role: member.role,
		})),
		providers: (providersResult.data ?? []).filter((provider) => routableProviderIds.has(String(provider.api_provider_id))).map((provider) => ({
			id: provider.api_provider_id,
			name: provider.api_provider_name ?? provider.api_provider_id,
			familyId: provider.provider_family_id ?? provider.api_provider_id,
			offerLabel: provider.offer_label ?? null,
			offerScope: provider.offer_scope ?? null,
		})),
		teamName: teamResult.data?.name ?? null,
		canManageGuardrails: ["owner", "admin"].includes(context.role.toLowerCase()),
	};
}

export const accountSettingsPolicyRouter = new Hono<{ Bindings: Env }>();

function restriction(mode: unknown, ids: unknown) {
	return {
		mode: mode === "allowlist" || mode === "blocklist" ? mode : "none",
		ids: Array.isArray(ids) ? ids.map((id) => String(id ?? "").trim()).filter(Boolean) : [],
	};
}

accountSettingsPolicyRouter.get("/chat/effective-policy", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ guardrails: [], workspace: null, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	// Chat requests use the member's managed key, which has no department of its own, so the
	// gateway applies the workspace, the member's departments and the member
	// (resolve_member_guardrails), plus anything assigned to that key directly.
	let guardrailIds: string[];
	let workspaceResult;
	try {
		const [workspaceRow, memberRows, chatKeyRow] = await Promise.all([
			context.client.from("workspace_settings").select("provider_restriction_mode,provider_restriction_provider_ids,model_restriction_mode,model_restriction_model_ids").eq("workspace_id", workspaceId).maybeSingle(),
			readAllPages<{ guardrail_id: string | null }>((from, to) => context.client
				.rpc("resolve_member_guardrails", { p_workspace_id: workspaceId, p_user_id: context.user.id })
				.order("guardrail_id").order("source_type").order("source_id").range(from, to)),
			context.client.from("keys").select("id").eq("workspace_id", workspaceId).eq("created_by", context.user.id).eq("name", "__chat_route_managed_key__").maybeSingle(),
		]);
		if (workspaceRow.error || memberRows.error || chatKeyRow.error) throw new Error("settings_unavailable");
		workspaceResult = workspaceRow;
		const keyRows = chatKeyRow.data?.id
			? await readAllPages<{ guardrail_id: string | null }>((from, to) => context.client.from("workspace_guardrail_assignments")
				.select("guardrail_id").eq("workspace_id", workspaceId).eq("target_type", "key").eq("target_id", chatKeyRow.data!.id)
				.order("guardrail_id").range(from, to))
			: { data: [], error: null };
		if (keyRows.error) throw new Error("settings_unavailable");
		guardrailIds = [...new Set([...memberRows.data, ...keyRows.data].map((row) => String(row.guardrail_id ?? "")).filter(Boolean))];
	} catch {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const guardrailRows: unknown[] = [];
	for (let index = 0; index < guardrailIds.length; index += 200) {
		const batch = await context.client.from("workspace_guardrails").select("id,name,enabled,provider_restriction_mode,provider_restriction_provider_ids,model_restriction_mode,allowed_api_model_ids").eq("workspace_id", workspaceId).eq("enabled", true).in("id", guardrailIds.slice(index, index + 200));
		if (batch.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		guardrailRows.push(...(batch.data ?? []));
	}
	const guardrailsResult = { data: guardrailRows };
	const normalize = (row: any, modelIdsKey = "model_restriction_model_ids") => ({
		provider: restriction(row?.provider_restriction_mode, row?.provider_restriction_provider_ids),
		model: restriction(row?.model_restriction_mode, row?.[modelIdsKey]),
	});
	return c.json({
		workspace: normalize(workspaceResult.data),
		guardrails: (guardrailsResult.data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name ?? "Guardrail"), ...normalize(row, "allowed_api_model_ids") })),
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/routing", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ canManage: false, responseHealingEnabled: false, responseHealingLocked: false, responseHealingMode: "safe", routingMode: "balanced", teamName: null, alphaChannelEnabled: false, betaChannelEnabled: false, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [teamResult, settingsResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
		context.client.from("workspace_settings").select("routing_mode,beta_channel_enabled,alpha_channel_enabled,response_healing_enabled,response_healing_locked,response_healing_mode").eq("workspace_id", workspaceId).maybeSingle(),
	]);
	if (teamResult.error || settingsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		responseHealingEnabled: Boolean(settingsResult.data?.response_healing_enabled),
		canManage: ["owner", "admin"].includes(context.role.toLowerCase()),
		responseHealingLocked: Boolean(settingsResult.data?.response_healing_locked),
		responseHealingMode: settingsResult.data?.response_healing_mode === "strict" ? "strict" : "safe",
		routingMode: settingsResult.data?.routing_mode ?? "balanced",
		teamName: teamResult.data?.name ?? null,
		alphaChannelEnabled: Boolean(settingsResult.data?.alpha_channel_enabled),
		betaChannelEnabled: Boolean(settingsResult.data?.beta_channel_enabled),
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.put("/routing", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!['owner', 'admin'].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const mode = ["balanced", "price", "latency", "throughput"].includes(String(body.mode)) ? String(body.mode) : "balanced";
	const payload: Record<string, unknown> = { workspace_id: workspaceId, routing_mode: mode, updated_at: new Date().toISOString() };
	if (typeof body.betaChannelEnabled === "boolean") payload.beta_channel_enabled = body.betaChannelEnabled;
	if (typeof body.alphaChannelEnabled === "boolean") payload.alpha_channel_enabled = body.betaChannelEnabled === false ? false : body.alphaChannelEnabled;
	if (typeof body.responseHealingEnabled === "boolean") payload.response_healing_enabled = body.responseHealingEnabled;
	if (typeof body.responseHealingLocked === "boolean") payload.response_healing_locked = body.responseHealingLocked;
	if (body.responseHealingMode === "safe" || body.responseHealingMode === "strict") payload.response_healing_mode = body.responseHealingMode;
	const result = await context.client.from("workspace_settings").upsert(payload, { onConflict: "workspace_id" });
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	let gatewayCacheInvalidated = false;
	try {
		gatewayCacheInvalidated = await invalidateWorkspaceGatewayContext(context, c.env);
	} catch {
		gatewayCacheInvalidated = false;
	}
	return c.json({ ok: true, gatewayCacheInvalidated }, 200, PRIVATE_NO_STORE_HEADERS);
});

// Successor routing: send requests for a model no provider serves any more to
// a replacement. The gateway reads these settings with a short cache, so a
// change takes effect within about a minute.
accountSettingsPolicyRouter.get("/routing/successor", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [settingsResult, replacementsResult, overviewResult] = await Promise.all([
		context.client.from("workspace_settings")
			.select("model_successor_redirect_enabled,model_successor_price_policy,model_successor_max_price_increase_percent")
			.eq("workspace_id", workspaceId)
			.maybeSingle(),
		context.client.from("workspace_model_successor_overrides")
			.select("model_slug,successor_model_slug,updated_at")
			.eq("workspace_id", workspaceId)
			.order("model_slug")
			.limit(MAX_SUCCESSOR_REPLACEMENTS),
		// The workspace's affected models and what routing does for each; not essential, so a failure leaves it empty.
		context.client.rpc("get_workspace_model_successor_overview", { p_workspace_id: workspaceId }),
	]);
	if (settingsResult.error || replacementsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		canManage: ["owner", "admin"].includes(context.role.toLowerCase()),
		...successorSettingsFromRow(settingsResult.data),
		replacements: (replacementsResult.data ?? []).map((row: any) => ({
			model: String(row.model_slug),
			successor: typeof row.successor_model_slug === "string" ? row.successor_model_slug : null,
			updatedAt: row.updated_at ?? null,
		})),
		models: overviewResult.error ? [] : successorOverviewFromRows(overviewResult.data),
		modelsAvailable: !overviewResult.error,
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.put("/routing/successor", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const settings = parseSuccessorSettings(body);
	if (settings.ok === false) {
		return c.json(settings.error === "invalid_max_price_increase_percent" ? { error: settings.error, maximum: MAX_SUCCESSOR_PRICE_INCREASE_PERCENT } : { error: settings.error }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	const result = await context.client.from("workspace_settings").upsert({
		workspace_id: workspaceId,
		...settings.value,
		updated_at: new Date().toISOString(),
	}, { onConflict: "workspace_id" });
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.put("/routing/successor/replacements", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	// successor null means "never redirect this model".
	const replacement = parseSuccessorReplacement(body);
	if (replacement.ok === false) return c.json({ error: replacement.error }, 400, PRIVATE_NO_STORE_HEADERS);
	const { model, successor } = replacement.value;
	const slugs = successor ? [model, successor] : [model];
	const models = await context.client.from("v2_models").select("model_slug,status").in("model_slug", slugs).eq("hidden", false);
	if (models.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const statuses = new Map((models.data ?? []).map((row: any) => [String(row.model_slug), String(row.status ?? "")]));
	const catalogueError = successorReplacementCatalogueError(replacement.value, statuses);
	if (catalogueError) return c.json({ error: catalogueError }, 400, PRIVATE_NO_STORE_HEADERS);
	const existing = await context.client.from("workspace_model_successor_overrides").select("model_slug", { count: "exact", head: true }).eq("workspace_id", workspaceId);
	if (existing.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if ((existing.count ?? 0) >= MAX_SUCCESSOR_REPLACEMENTS) {
		const current = await context.client.from("workspace_model_successor_overrides").select("model_slug").eq("workspace_id", workspaceId).eq("model_slug", model).maybeSingle();
		if (current.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if (!current.data) return c.json({ error: "too_many_replacements", maximum: MAX_SUCCESSOR_REPLACEMENTS }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	const result = await context.client.from("workspace_model_successor_overrides").upsert({
		workspace_id: workspaceId,
		model_slug: model,
		successor_model_slug: successor,
		created_by: context.user.id,
		updated_at: new Date().toISOString(),
	}, { onConflict: "workspace_id,model_slug" });
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true, replacement: { model, successor } }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.delete("/routing/successor/replacements", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const model = successorModelSlug(body.model);
	if (!model) return c.json({ error: "invalid_model" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_model_successor_overrides").delete().eq("workspace_id", workspaceId).eq("model_slug", model);
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/routing/auto", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) {
		return c.json({
			autoRouting: autoRoutingFromRow(null),
			canManage: false,
			teamName: null,
			workspaceId: null,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [teamResult, settingsResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
		context.client.from("workspace_settings")
			.select(AUTO_ROUTING_COLUMNS)
			.eq("workspace_id", workspaceId)
			.maybeSingle(),
	]);
	if (teamResult.error || settingsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		autoRouting: autoRoutingFromRow(settingsResult.data),
		canManage: ["owner", "admin"].includes(context.role.toLowerCase()),
		teamName: teamResult.data?.name ?? null,
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.put("/routing/auto", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) {
		return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	}

	const update = parseAutoRoutingUpdate(body);
	if (update.ok === false) return c.json(update.error, 400, PRIVATE_NO_STORE_HEADERS);
	const payload = { workspace_id: workspaceId, ...update.value };
	const result = await context.client.from("workspace_settings").upsert(payload, { onConflict: "workspace_id" }).select("auto_routing_revision,auto_routing_updated_at").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	let gatewayCacheInvalidated = false;
	try {
		gatewayCacheInvalidated = await invalidateWorkspaceGatewayContext(context, c.env);
	} catch {
		gatewayCacheInvalidated = false;
	}
	return c.json({
		autoRouting: autoRoutingFromRow({ ...payload, ...result.data }),
		gatewayCacheInvalidated,
		ok: true,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/presets", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ currentUserId: undefined, initialTeamId: null, workspacePublisher: { handle: null, canManage: false }, teams: [], teamsWithPresets: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = c.req.query("workspaceId")?.trim() || null;
	const client = getDataClient(c.env);
	const membershipsResult = await client.from("workspace_members").select("workspace_id,teams:workspaces(id,name)").eq("user_id", user.id);
	if (membershipsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const teams = (membershipsResult.data ?? []).flatMap((membership) => {
		const team = Array.isArray(membership.teams) ? membership.teams[0] : membership.teams;
		return team?.id && team?.name ? [{ id: team.id, name: team.name }] : [];
	});
	let presets: unknown[] = [];
	let workspacePublisher: { handle: string | null; canManage: boolean } = { handle: null, canManage: false };
	if (workspaceId) {
		const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
		if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
		const presetsResult = await context.client.from("presets").select("*").eq("workspace_id", workspaceId).is("archived_at", null).or(`visibility.neq.private,created_by.eq.${user.id}`);
		if (presetsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		const rows = withoutOthersPrivateDrafts(presetsResult.data ?? [], user.id);
		presets = await withPresetLifecycle(context.client, rows).catch((error) => {
			console.warn("preset_lifecycle_enrichment_failed", error);
			return presetLifecycleFallback(rows);
		});
		presets = presets.map((preset: any) => ({ ...preset, canPublish: canWritePreset(context, user.id, { ...preset, visibility: preset.published_visibility ?? preset.visibility }) }));
		if (!teams.some((team) => team.id === workspaceId)) {
			const workspaceResult = await context.client.from("workspaces").select("id,name,publisher_handle").eq("id", workspaceId).maybeSingle();
			if (workspaceResult.data?.id && workspaceResult.data.name) teams.push({ id: workspaceResult.data.id, name: workspaceResult.data.name });
		}
		const publisherResult = await context.client.from("workspaces").select("publisher_handle").eq("id", workspaceId).maybeSingle();
		if (!publisherResult.error) workspacePublisher = {
			handle: String(publisherResult.data?.publisher_handle ?? "").trim().toLowerCase() || null,
			canManage: ["owner", "admin"].includes(context.role.toLowerCase()),
		};
	}
	const activeTeam = teams.find((team) => team.id === workspaceId);
	return c.json({ currentUserId: user.id, initialTeamId: workspaceId, workspacePublisher, teams, teamsWithPresets: activeTeam ? [{ ...activeTeam, presets }] : [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

function validPresetName(value: string) {
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= 120 && !/\p{C}/u.test(normalized);
}
function presetVisibility(value: unknown) { return ["private", "team", "public"].includes(String(value)) ? String(value) : "team"; }
function normalizePresetSlug(value: unknown) { return String(value ?? "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._:-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-._:]+|[-._:]+$/g, ""); }
function canWritePreset(context: AccountWorkspaceContext, userId: string, preset: { created_by?: string | null; visibility?: string | null }) { return preset.created_by === userId || (preset.visibility !== "private" && ["owner", "admin"].includes(context.role.toLowerCase())); }
async function presetSlugConflict(client: ReturnType<typeof getDataClient>, workspaceId: string, slug: string, excludeId?: string) {
	let scoped = client.from("presets").select("id").eq("workspace_id", workspaceId).eq("slug", slug).is("archived_at", null); if (excludeId) scoped = scoped.neq("id", excludeId);
	const workspace = await scoped.maybeSingle(); if (workspace.error) throw workspace.error; if (workspace.data) return "workspace";
	return null;
}
async function workspacePublisher(client: ReturnType<typeof getDataClient>, workspaceId: string) {
	const result = await client.from("workspaces").select("publisher_handle").eq("id", workspaceId).maybeSingle();
	if (result.error) throw result.error;
	return String(result.data?.publisher_handle ?? "").trim().toLowerCase() || null;
}
function presetHasDraftChanges(row: any) {
	return row.draft_name !== row.name
		|| row.draft_slug !== row.slug
		|| row.draft_description !== row.description
		|| JSON.stringify(row.draft_config) !== JSON.stringify(row.config)
		|| row.draft_visibility !== row.visibility;
}
/**
 * A private draft is its creator's alone, as in the detail and versions routes: anyone else sees the
 * published preset, with the draft fields replaced by the published ones before anything is serialised.
 */
function withoutOthersPrivateDrafts(rows: any[], userId: string) {
	return rows.map((row) => row.draft_visibility === "private" && row.created_by !== userId
		? { ...row, draft_name: row.name, draft_slug: row.slug, draft_description: row.description, draft_config: row.config, draft_visibility: row.visibility }
		: row);
}
function draftDescription(row: any) { return row.draft_description === undefined ? row.description : row.draft_description; }
async function withPresetLifecycle(client: ReturnType<typeof getDataClient>, rows: any[]) {
	const sourceIds = [...new Set(rows.map((row) => String(row.source_preset_id ?? "")).filter(Boolean))];
	const latestBySource = new Map<string, { id: string; version_number: number }>();
	if (sourceIds.length) {
		const publicSources = await client.from("presets").select("id").in("id", sourceIds).eq("visibility", "public").is("archived_at", null);
		if (publicSources.error) throw publicSources.error;
		const publicSourceIds = (publicSources.data ?? []).map((source) => String(source.id));
		if (!publicSourceIds.length) return presetLifecycleFallback(rows);
		const versions = await client.from("preset_versions").select("id,preset_id,version_number").in("preset_id", publicSourceIds).eq("visibility", "public").order("version_number", { ascending: false });
		if (versions.error) throw versions.error;
		for (const version of versions.data ?? []) if (!latestBySource.has(String(version.preset_id))) latestBySource.set(String(version.preset_id), { id: String(version.id), version_number: Number(version.version_number) });
	}
	return rows.map((row) => ({ ...row, published_visibility: row.visibility, name: row.draft_name ?? row.name, slug: row.draft_slug ?? row.slug, description: draftDescription(row), config: row.draft_config ?? row.config, visibility: row.draft_visibility ?? row.visibility, hasDraftChanges: presetHasDraftChanges(row), latestUpstreamVersion: latestBySource.get(String(row.source_preset_id ?? "")) ?? null, hasUpstreamUpdate: Boolean(row.source_preset_id && latestBySource.get(String(row.source_preset_id))?.id !== row.upstream_version_id) }));
}
function presetLifecycleFallback(rows: any[]) {
	return rows.map((row) => ({ ...row, published_visibility: row.visibility, name: row.draft_name ?? row.name, slug: row.draft_slug ?? row.slug, description: draftDescription(row), config: row.draft_config ?? row.config, visibility: row.draft_visibility ?? row.visibility, hasDraftChanges: presetHasDraftChanges(row), latestUpstreamVersion: null, hasUpstreamUpdate: false }));
}
async function purgePresetCache(c: { executionCtx: object }, id?: string) {
	return purgeWorkerCacheTags(c.executionCtx, ["web-api-marketplace", "web-api-marketplace-presets", ...(id ? [`web-api-marketplace-preset-${encodeURIComponent(id).replace(/%/g, "")}`] : [])]);
}

accountSettingsPolicyRouter.get("/presets/list", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("presets").select("*").eq("workspace_id", workspaceId).is("archived_at", null).or(`visibility.neq.private,created_by.eq.${context.user.id}`).order("created_at", { ascending: false });
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const rows = withoutOthersPrivateDrafts(result.data ?? [], context.user.id);
	const presets = await withPresetLifecycle(context.client, rows).catch((error) => {
		console.warn("preset_lifecycle_enrichment_failed", error);
		return presetLifecycleFallback(rows);
	});
	for (const preset of presets) preset.canPublish = canWritePreset(context, context.user.id, { ...preset, visibility: preset.published_visibility ?? preset.visibility });
	return c.json({ presets }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.put("/presets/publisher", async (c) => {
	const body: { workspaceId?: string; handle?: string } = await c.req.json<{ workspaceId?: string; handle?: string }>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	const handle = String(body.handle ?? "").trim().toLowerCase();
	if (!workspaceId || !/^[a-z0-9][a-z0-9_-]{2,39}$/.test(handle)) return c.json({ error: "invalid_publisher_handle" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.rpc("rename_workspace_publisher_handle", { target_workspace_id: workspaceId, actor_user_id: context.user.id, requested_handle: handle });
	if (result.error?.code === "23505" || result.error?.message?.includes("publisher_handle_reserved")) return c.json({ error: "publisher_handle_conflict" }, 409, PRIVATE_NO_STORE_HEADERS);
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	await Promise.all([
		purgeWorkerCacheTags(c.executionCtx, ["web-api-marketplace", "web-api-marketplace-presets"]),
		invalidateWorkspaceGatewayContext(context, c.env).catch(() => false),
	]);
	return c.json({ handle: String(result.data ?? handle) }, 200, PRIVATE_NO_STORE_HEADERS);
});

/** Problems with a config's prompt template, or null when it has none or it is valid. */
function promptTemplateIssues(config: unknown): PromptTemplateIssue[] | null {
	if (!config || typeof config !== "object" || Array.isArray(config)) return null;
	const template = (config as Record<string, unknown>).prompt;
	if (template === undefined || template === null) return null;
	const compiled = compilePromptTemplate(template);
	return compiled.ok === false ? compiled.issues : null;
}

accountSettingsPolicyRouter.post("/presets", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim(); const name = String(body.name ?? "").trim(); const slug = normalizePresetSlug(body.slug ?? name);
	if (!workspaceId || !validPresetName(name) || !slug) return c.json({ error: "invalid_preset" }, 400, PRIVATE_NO_STORE_HEADERS);
	const templateIssues = promptTemplateIssues(body.config);
	if (templateIssues) return c.json({ error: "invalid_prompt_template", issues: templateIssues }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const duplicate = await context.client.from("presets").select("id").eq("workspace_id", workspaceId).eq("name", name).maybeSingle();
	if (duplicate.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (duplicate.data) return c.json({ error: "duplicate_preset" }, 409, PRIVATE_NO_STORE_HEADERS);
	const visibility = presetVisibility(body.visibility); const publisher = visibility === "public" ? await workspacePublisher(context.client, workspaceId).catch(() => null) : null;
	if (visibility === "public" && !publisher) return c.json({ error: "workspace_publisher_required" }, 409, PRIVATE_NO_STORE_HEADERS);
	const conflict = await presetSlugConflict(context.client, workspaceId, slug).catch(() => "error");
	if (conflict === "error") return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (conflict) return c.json({ error: conflict === "public" ? "public_slug_conflict" : "duplicate_preset_slug", slug }, 409, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("presets").insert({ workspace_id: workspaceId, name, slug, created_by: user.id, config: body.config && typeof body.config === "object" ? body.config : {}, visibility, ...(body.description ? { description: String(body.description).trim().slice(0, 500) } : {}) }).select("id,created_at").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const cache = await purgePresetCache(c, result.data?.id);
	return c.json({ id: result.data?.id, name, createdAt: result.data?.created_at, canonicalModel: publisher ? `@${publisher}/${slug}` : `@${slug}`, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/presets/:presetId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const result = await client.from("presets").select(PRESET_DETAIL_COLUMNS).eq("id", c.req.param("presetId")).is("archived_at", null).maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!result.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: result.data.workspace_id }); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	// Private presets are visible to their creator only, as in the list and versions routes.
	if ((result.data.visibility === "private" || result.data.draft_visibility === "private") && result.data.created_by !== user.id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	return c.json({ preset: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.post("/presets/:presetId/fork", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: { workspaceId?: string; sourceVersionId?: string } = await c.req.json<{ workspaceId?: string; sourceVersionId?: string }>().catch(() => ({})); const workspaceId = String(body.workspaceId ?? "").trim();
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId }); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const source = await context.client.from("presets").select("id,name,slug,description,config,visibility,active_version_id").eq("id", c.req.param("presetId")).is("archived_at", null).maybeSingle();
	if (source.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!source.data || source.data.visibility !== "public") return c.json({ error: "not_public" }, 404, PRIVATE_NO_STORE_HEADERS);
	let sourceSnapshot = { id: source.data.active_version_id, name: source.data.name, slug: source.data.slug, description: source.data.description, config: source.data.config };
	if (body.sourceVersionId) {
		const version = await context.client.from("preset_versions").select("id,name,slug,description,config").eq("id", body.sourceVersionId).eq("preset_id", source.data.id).eq("visibility", "public").maybeSingle();
		if (version.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if (!version.data) return c.json({ error: "invalid_source_version" }, 400, PRIVATE_NO_STORE_HEADERS);
		sourceSnapshot = version.data;
	}
	const names = await context.client.from("presets").select("name").eq("workspace_id", workspaceId).is("archived_at", null); if (names.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const existing = new Set((names.data ?? []).map((row) => row.name)); const base = String(sourceSnapshot.name || "@preset"); let name = base;
	if (existing.has(name)) { name = `${base}-copy`; for (let i = 2; existing.has(name) && i <= 20; i++) name = `${base}-copy-${i}`; }
	if (existing.has(name)) return c.json({ error: "name_unavailable" }, 409, PRIVATE_NO_STORE_HEADERS);
	const baseSlug = normalizePresetSlug(sourceSnapshot.slug ?? name); let slug = baseSlug; let slugAttempts = 0;
	while (await presetSlugConflict(context.client, workspaceId, slug)) { slugAttempts += 1; if (slugAttempts > 20) return c.json({ error: "slug_unavailable" }, 409, PRIVATE_NO_STORE_HEADERS); slug = `${baseSlug}-copy${slugAttempts > 1 ? `-${slugAttempts}` : ""}`; }
	const result = await context.client.from("presets").insert({ workspace_id: workspaceId, name, slug, created_by: user.id, config: sourceSnapshot.config ?? {}, visibility: "private", source_preset_id: source.data.id, source_preset_version_id: sourceSnapshot.id, upstream_version_id: sourceSnapshot.id, ...(sourceSnapshot.description ? { description: sourceSnapshot.description } : {}) }).select("id").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); const cache = await purgePresetCache(c, source.data.id); if (result.data?.id) await purgePresetCache(c, result.data.id);
	return c.json({ id: result.data?.id, name, slug, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.put("/presets/:presetId", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const id = c.req.param("presetId"); const existing = await client.from("presets").select("id,workspace_id,name,slug,config,visibility,created_by,draft_name,draft_slug,draft_description,draft_config,draft_visibility,source_preset_id,upstream_version_id").eq("id", id).is("archived_at", null).maybeSingle();
	if (existing.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!existing.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: existing.data.workspace_id }); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!canWritePreset(context, user.id, existing.data)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	// A private draft can only be changed (or made visible) by its creator.
	const creator = existing.data.created_by === user.id;
	if (!creator && existing.data.draft_visibility === "private") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (body.name != null) { const name = String(body.name).trim(); if (!validPresetName(name)) return c.json({ error: "invalid_preset" }, 400, PRIVATE_NO_STORE_HEADERS); update.draft_name = name; }
	if (body.description !== undefined) update.draft_description = body.description ? String(body.description).trim().slice(0, 500) : null;
	if (body.config !== undefined) update.draft_config = body.replaceConfig === true ? (body.config && typeof body.config === "object" ? body.config : {}) : { ...((existing.data.draft_config as Record<string, unknown>) ?? (existing.data.config as Record<string, unknown>) ?? {}), ...(body.config && typeof body.config === "object" ? body.config : {}) };
	if (update.draft_config !== undefined) {
		const templateIssues = promptTemplateIssues(update.draft_config);
		if (templateIssues) return c.json({ error: "invalid_prompt_template", issues: templateIssues }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (body.visibility !== undefined) update.draft_visibility = presetVisibility(body.visibility);
	if (body.slug !== undefined) update.draft_slug = normalizePresetSlug(body.slug);
	if (["sequential", "semver", "date"].includes(String(body.versioningMethod))) update.versioning_method = String(body.versioningMethod);
	const nextSlug = String(update.draft_slug ?? existing.data.draft_slug ?? existing.data.slug ?? ""); const nextVisibility = String(update.draft_visibility ?? existing.data.draft_visibility ?? existing.data.visibility); if (!nextSlug) return c.json({ error: "invalid_preset_slug" }, 400, PRIVATE_NO_STORE_HEADERS);
	const publisher = nextVisibility === "public" ? await workspacePublisher(client, existing.data.workspace_id).catch(() => null) : null; if (nextVisibility === "public" && !publisher) return c.json({ error: "workspace_publisher_required" }, 409, PRIVATE_NO_STORE_HEADERS);
	const conflict = await presetSlugConflict(client, existing.data.workspace_id, nextSlug, id).catch(() => "error"); if (conflict === "error") return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (conflict) return c.json({ error: "duplicate_preset_slug", slug: nextSlug }, 409, PRIVATE_NO_STORE_HEADERS);
	let write = client.from("presets").update(update).eq("id", id).is("archived_at", null);
	// Checked again in the write, so a draft made private since the read is not overwritten.
	if (!creator) write = write.neq("visibility", "private").or("draft_visibility.is.null,draft_visibility.neq.private");
	const result = await write.select("id"); if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!result.data?.length) return c.json({ error: "preset_changed" }, 409, PRIVATE_NO_STORE_HEADERS);
	const cache = await purgePresetCache(c, id); return c.json({ success: true, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/presets/:presetId/versions", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const id = c.req.param("presetId");
	const preset = await client.from("presets").select("workspace_id,created_by,visibility,draft_visibility,active_version_id").eq("id", id).is("archived_at", null).maybeSingle();
	if (preset.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!preset.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: preset.data.workspace_id }); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const creator = preset.data.created_by === user.id;
	if (preset.data.visibility === "private" && !creator) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	// A version published while the preset was private stays its creator's, even after a later version is shared.
	let versionsQuery = client.from("preset_versions").select("id,version_number,version_label,name,slug,description,visibility,release_notes,created_at,config").eq("preset_id", id);
	if (!creator) versionsQuery = versionsQuery.neq("visibility", "private");
	const [versions, labels] = await Promise.all([
		versionsQuery.order("version_number", { ascending: false }),
		client.from("preset_version_labels").select("label,version_id,updated_at").eq("preset_id", id).order("label", { ascending: true }),
	]);
	if (versions.error || labels.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const visibleVersionIds = new Set((versions.data ?? []).map((version) => String(version.id)));
	const visibleLabels = (labels.data ?? []).filter((row) => visibleVersionIds.has(String(row.version_id)));
	const labelsByVersion = new Map<string, string[]>();
	for (const row of visibleLabels) labelsByVersion.set(String(row.version_id), [...(labelsByVersion.get(String(row.version_id)) ?? []), String(row.label)]);
	return c.json({
		versions: (versions.data ?? []).map((version) => ({ ...version, config: presetVersionContent(version.config), labels: labelsByVersion.get(String(version.id)) ?? [] })),
		labels: visibleLabels,
		activeVersionId: preset.data.active_version_id ?? null,
		canManageLabels: canManagePresetLabels(context, user.id, preset.data),
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

/** What the editor shows and compares for a version: its models and prompt template, not the rest of its config. */
function presetVersionContent(config: unknown): { models: string[]; prompt: unknown } {
	const value = config && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : {};
	return {
		models: Array.isArray(value.models) ? value.models.filter((model): model is string => typeof model === "string") : [],
		prompt: value.prompt && typeof value.prompt === "object" && !Array.isArray(value.prompt) ? value.prompt : null,
	};
}

/** The rule set_preset_version_label applies: the creator, or an owner or admin when the preset is shared. */
function canManagePresetLabels(context: AccountWorkspaceContext, userId: string, preset: { created_by?: string | null; visibility?: string | null; draft_visibility?: string | null }) {
	return canWritePreset(context, userId, { created_by: preset.created_by, visibility: preset.draft_visibility ?? preset.visibility });
}
const PRESET_LABEL_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
function normalizePresetLabel(value: unknown): string | null {
	const label = String(value ?? "").trim().toLowerCase();
	return PRESET_LABEL_PATTERN.test(label) && !/^v[0-9]+$/.test(label) ? label : null;
}
function presetLabelRpcError(message: string): { error: string; status: 400 | 403 | 404 } | null {
	if (message.includes("invalid_preset_label")) return { error: "invalid_preset_label", status: 400 };
	if (message.includes("preset_version_not_found")) return { error: "preset_version_not_found", status: 404 };
	if (message.includes("preset_not_found")) return { error: "not_found", status: 404 };
	if (message.includes("preset_label_forbidden")) return { error: "forbidden", status: 403 };
	return null;
}
async function presetForLabelChange(c: Context<{ Bindings: Env }>, userId: string) {
	const client = getDataClient(c.env);
	const preset = await client.from("presets").select("id,workspace_id,created_by,visibility,draft_visibility").eq("id", String(c.req.param("presetId") ?? "")).is("archived_at", null).maybeSingle();
	if (preset.error) return { response: c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS) } as const;
	if (!preset.data?.workspace_id) return { response: c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS) } as const;
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: preset.data.workspace_id });
	if (!context || !canManagePresetLabels(context, userId, preset.data)) return { response: c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS) } as const;
	return { client, preset: preset.data } as const;
}

accountSettingsPolicyRouter.put("/presets/:presetId/labels/:label", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const label = normalizePresetLabel(c.req.param("label")); if (!label) return c.json({ error: "invalid_preset_label" }, 400, PRIVATE_NO_STORE_HEADERS);
	const body: { versionId?: string } = await c.req.json<{ versionId?: string }>().catch(() => ({})); const versionId = String(body.versionId ?? "").trim();
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) return c.json({ error: "preset_version_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const loaded = await presetForLabelChange(c, user.id); if ("response" in loaded) return loaded.response;
	// A version published while the preset was private is its creator's; set_preset_version_label agrees.
	if (loaded.preset.created_by !== user.id) {
		const target = await loaded.client.from("preset_versions").select("id").eq("preset_id", loaded.preset.id).eq("id", versionId).neq("visibility", "private").maybeSingle();
		if (target.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if (!target.data) return c.json({ error: "preset_version_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	}
	const saved = await loaded.client.rpc("set_preset_version_label", { p_preset_id: loaded.preset.id, p_label: label, p_version_id: versionId, actor_user_id: user.id });
	if (saved.error) { const mapped = presetLabelRpcError(saved.error.message ?? ""); return c.json({ error: mapped?.error ?? "settings_unavailable" }, mapped?.status ?? 503, PRIVATE_NO_STORE_HEADERS); }
	const row = Array.isArray(saved.data) ? saved.data[0] : saved.data;
	const cache = await purgePresetCache(c, loaded.preset.id);
	return c.json({ label: row ?? { label, version_id: versionId }, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.delete("/presets/:presetId/labels/:label", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const label = normalizePresetLabel(c.req.param("label")); if (!label) return c.json({ error: "invalid_preset_label" }, 400, PRIVATE_NO_STORE_HEADERS);
	const loaded = await presetForLabelChange(c, user.id); if ("response" in loaded) return loaded.response;
	const removed = await loaded.client.rpc("remove_preset_version_label", { p_preset_id: loaded.preset.id, p_label: label, actor_user_id: user.id });
	if (removed.error) { const mapped = presetLabelRpcError(removed.error.message ?? ""); return c.json({ error: mapped?.error ?? "settings_unavailable" }, mapped?.status ?? 503, PRIVATE_NO_STORE_HEADERS); }
	if (removed.data !== true) return c.json({ error: "label_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const cache = await purgePresetCache(c, loaded.preset.id);
	return c.json({ removed: true, label, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.post("/presets/:presetId/versions", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const id = c.req.param("presetId"); const body: { releaseNotes?: string; versionLabel?: string } = await c.req.json<{ releaseNotes?: string; versionLabel?: string }>().catch(() => ({}));
	const preset = await client.from("presets").select("workspace_id,created_by,name,slug,description,config,visibility,draft_name,draft_slug,draft_description,draft_config,draft_visibility").eq("id", id).is("archived_at", null).maybeSingle();
	if (preset.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!preset.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: preset.data.workspace_id }); if (!context || !canWritePreset(context, user.id, preset.data)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!presetHasDraftChanges(preset.data)) return c.json({ error: "no_draft_changes" }, 409, PRIVATE_NO_STORE_HEADERS);
	const templateIssues = promptTemplateIssues(preset.data.draft_config ?? preset.data.config);
	if (templateIssues) return c.json({ error: "invalid_prompt_template", issues: templateIssues }, 400, PRIVATE_NO_STORE_HEADERS);
	if (preset.data.draft_visibility === "public" && !await workspacePublisher(client, preset.data.workspace_id).catch(() => null)) return c.json({ error: "workspace_publisher_required" }, 409, PRIVATE_NO_STORE_HEADERS);
	const published = await client.rpc("publish_preset_version", { target_preset_id: id, actor_user_id: user.id, notes: String(body.releaseNotes ?? "").slice(0, 1000), requested_label: body.versionLabel ? String(body.versionLabel).slice(0, 100) : null });
	if (published.error) {
		const message = published.error.message ?? "";
		if (message.includes("invalid_semver_label")) return c.json({ error: "invalid_semver_label" }, 400, PRIVATE_NO_STORE_HEADERS);
		if (published.error.code === "23505") return c.json({ error: "version_label_taken" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (message.includes("preset_not_found")) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		if (message.includes("preset_publish_forbidden")) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
		return c.json({ error: "version_publish_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const version = Array.isArray(published.data) ? published.data[0] : published.data;
	const cache = await purgePresetCache(c, id); return c.json({ version, cache }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.post("/presets/:presetId/upstream", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const id = c.req.param("presetId"); const body: { versionId?: string } = await c.req.json<{ versionId?: string }>().catch(() => ({}));
	const preset = await client.from("presets").select("workspace_id,created_by").eq("id", id).is("archived_at", null).maybeSingle();
	if (preset.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!preset.data?.workspace_id || !body.versionId) return c.json({ error: "invalid_upstream_version" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: preset.data.workspace_id }); if (!context || preset.data.created_by !== user.id) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const applied = await client.rpc("apply_preset_upstream_version", { target_preset_id: id, target_version_id: body.versionId, actor_user_id: user.id });
	if (applied.error) {
		const message = applied.error.message ?? "";
		if (message.includes("preset_has_local_draft_changes")) return c.json({ error: "preset_has_local_draft_changes" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (message.includes("upstream_preset_not_public") || message.includes("upstream_version_not_public") || message.includes("upstream_version_not_found")) return c.json({ error: "upstream_version_unavailable" }, 409, PRIVATE_NO_STORE_HEADERS);
		return c.json({ error: "upstream_update_failed" }, 409, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ appliedToDraft: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.delete("/presets/:presetId", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const id = c.req.param("presetId"); const existing = await client.from("presets").select("name,workspace_id,created_by,visibility").eq("id", id).maybeSingle();
	if (existing.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!existing.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: existing.data.workspace_id }); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!canWritePreset(context, user.id, existing.data)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const confirm = c.req.query("confirmName"); if (confirm && confirm !== existing.data.name) return c.json({ error: "confirmation_mismatch" }, 409, PRIVATE_NO_STORE_HEADERS);
	let archive = client.from("presets").update({ archived_at: new Date().toISOString() }).eq("id", id).is("archived_at", null);
	// Checked again in the write, so a preset made private since the read stays its creator's to archive.
	if (existing.data.created_by !== user.id) archive = archive.neq("visibility", "private");
	const result = await archive.select("id"); if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!result.data?.length) return c.json({ error: "preset_changed" }, 409, PRIVATE_NO_STORE_HEADERS);
	const cache = await purgePresetCache(c, id); return c.json({ success: true, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

type GuardrailAssignmentRow = { guardrail_id: string | null; target_type: string | null; target_id: string | null };

/** Every assignment of these guardrails (workspace_guardrail_assignments: workspace, department, member and key levels). */
function readGuardrailAssignments(context: AccountWorkspaceContext, workspaceId: string, guardrailIds: string[]) {
	return readAllPages<GuardrailAssignmentRow>((from, to) => context.client.from("workspace_guardrail_assignments")
		.select("guardrail_id,target_type,target_id").eq("workspace_id", workspaceId).in("guardrail_id", guardrailIds)
		.order("guardrail_id").order("target_type").order("target_id").range(from, to));
}

/** Target ids per guardrail for each level, and the guardrails assigned to the whole workspace. */
function groupGuardrailAssignments(rows: GuardrailAssignmentRow[]) {
	const maps = { department: {} as Record<string, string[]>, key: {} as Record<string, string[]>, member: {} as Record<string, string[]> };
	const workspace: string[] = [];
	for (const row of rows) {
		if (!row.guardrail_id) continue;
		if (row.target_type === "workspace") {
			workspace.push(row.guardrail_id);
			continue;
		}
		if (!row.target_id || !(row.target_type === "department" || row.target_type === "key" || row.target_type === "member")) continue;
		const map = maps[row.target_type];
		(map[row.guardrail_id] ??= []).push(row.target_id);
	}
	return { ...maps, workspace };
}

type DepartmentScopeRow = { target_type: string | null; target_id: string | null; department_id: string | null };

/**
 * The workspace's departments, and the ones whose guardrails reach each key and member as the gateway
 * counts them (guardrail_department_scopes), so Settings, Guardrails can show where every guardrail
 * comes from. Before that function's migration has run, the scopes are empty: department guardrails
 * still show on the Departments view, just not on the keys and members they reach.
 */
async function loadGuardrailDepartments(context: AccountWorkspaceContext, workspaceId: string) {
	const [departments, scopes] = await Promise.all([
		readAllPages<{ id: string; name: string | null }>((from, to) => context.client.from("workspace_departments")
			.select("id,name").eq("workspace_id", workspaceId).order("name").order("id").range(from, to)),
		readAllPages<DepartmentScopeRow>((from, to) => context.client.rpc("guardrail_department_scopes", { p_workspace_id: workspaceId })
			.order("target_type").order("target_id").order("department_id").range(from, to)),
	]);
	if (departments.error) throw departments.error;
	const scopesMissing = scopes.error && isMissingRpc(scopes.error, "guardrail_department_scopes");
	if (scopes.error && !scopesMissing) throw scopes.error;
	const keyDepartmentIds: Record<string, string[]> = {};
	const memberDepartmentIds: Record<string, string[]> = {};
	for (const row of scopesMissing ? [] : scopes.data ?? []) {
		if (!row.target_id || !row.department_id) continue;
		const map = row.target_type === "key" ? keyDepartmentIds : row.target_type === "member" ? memberDepartmentIds : null;
		if (map) (map[row.target_id] ??= []).push(row.department_id);
	}
	return {
		departments: (departments.data ?? []).map((department) => ({ id: department.id, name: department.name?.trim() || department.id })),
		keyDepartmentIds,
		memberDepartmentIds,
	};
}

/** PostgREST (PGRST202) or Postgres (42883) saying a function does not exist yet. */
function isMissingRpc(error: unknown, name: string): boolean {
	const record = (error ?? {}) as { code?: unknown; message?: unknown };
	const code = String(record.code ?? "").toUpperCase();
	return (code === "PGRST202" || code === "42883") && String(record.message ?? "").includes(name);
}

accountSettingsPolicyRouter.get("/guardrails", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ activeProviderModels: [], departments: [], guardrailDepartmentIdsByGuardrailId: {}, guardrailKeyIdsByGuardrailId: {}, guardrailMemberIdsByGuardrailId: {}, guardrails: [], keyDepartmentIds: {}, keys: [], memberDepartmentIds: {}, members: [], providers: [], workspaceGuardrailIds: [], workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const [reference, departments, guardrailsResult] = await Promise.all([
			loadGuardrailReference(context),
			loadGuardrailDepartments(context, workspaceId),
			context.client.from("workspace_guardrails").select(GUARDRAIL_COLUMNS).eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
		]);
		if (guardrailsResult.error) throw guardrailsResult.error;
		const guardrails = guardrailsResult.data ?? [];
		const ids = guardrails.map((guardrail) => guardrail.id).filter(Boolean);
		const assignments = ids.length ? await readGuardrailAssignments(context, workspaceId, ids) : null;
		if (assignments?.error) throw assignments.error;
		const byTarget = groupGuardrailAssignments(assignments?.data ?? []);
		return c.json({
			...reference,
			...departments,
			guardrailDepartmentIdsByGuardrailId: byTarget.department,
			guardrailKeyIdsByGuardrailId: byTarget.key,
			guardrailMemberIdsByGuardrailId: byTarget.member,
			guardrails,
			workspaceGuardrailIds: byTarget.workspace,
			workspaceId,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	} catch {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsPolicyRouter.get("/guardrails/editor", async (c) => {
	const mode = c.req.query("mode") === "edit" ? "edit" : "create";
	const guardrailId = c.req.query("guardrailId")?.trim();
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ accountPolicy: accountPolicyFromRow(null), activeProviderModels: [], guardrail: null, initialDepartmentIds: [], initialKeyIds: [], initialMemberIds: [], initialWorkspaceAssigned: false, keys: [], members: [], mode, providers: [], teamName: null, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const [reference, guardrailResult, workspacePolicyResult] = await Promise.all([
			loadGuardrailReference(context),
			mode === "edit" && guardrailId
				? context.client.from("workspace_guardrails").select(GUARDRAIL_COLUMNS).eq("workspace_id", workspaceId).eq("id", guardrailId).maybeSingle()
				: Promise.resolve({ data: null, error: null }),
			context.client.from("workspace_settings").select("privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,model_restriction_mode,model_restriction_model_ids").eq("workspace_id", workspaceId).maybeSingle(),
		]);
		if (guardrailResult.error) throw guardrailResult.error;
		if (workspacePolicyResult.error) throw workspacePolicyResult.error;
		const editedGuardrailId = mode === "edit" ? guardrailResult.data?.id : null;
		const assignments = editedGuardrailId ? await readGuardrailAssignments(context, workspaceId, [editedGuardrailId]) : null;
		if (assignments?.error) throw assignments.error;
		const byTarget = groupGuardrailAssignments(assignments?.data ?? []);
		return c.json({
			...reference,
			accountPolicy: accountPolicyFromRow(workspacePolicyResult.data),
			guardrail: guardrailResult.data ?? null,
			initialDepartmentIds: editedGuardrailId ? byTarget.department[editedGuardrailId] ?? [] : [],
			initialKeyIds: editedGuardrailId ? byTarget.key[editedGuardrailId] ?? [] : [],
			initialMemberIds: editedGuardrailId ? byTarget.member[editedGuardrailId] ?? [] : [],
			initialWorkspaceAssigned: editedGuardrailId ? byTarget.workspace.includes(editedGuardrailId) : false,
			mode,
			workspaceId,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	} catch {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

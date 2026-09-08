import { Hono } from "hono";
import { invalidateWorkspaceGatewayContext } from "./gateway-invalidation";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import { purgeWorkerCacheTags } from "@/http/invalidation";

const GUARDRAIL_COLUMNS = "id,workspace_id,enabled,name,description,privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_free_may_publish_prompts,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed,model_restriction_mode,allowed_api_model_ids,prompt_injection_enabled,prompt_injection_action,sensitive_info_enabled,sensitive_info_default_action,sensitive_info_rules,daily_limit_requests,weekly_limit_requests,monthly_limit_requests,daily_limit_cost_nanos,weekly_limit_cost_nanos,monthly_limit_cost_nanos,created_at,updated_at";

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

async function loadGuardrailReference(context: AccountWorkspaceContext) {
	const [teamResult, keysResult, membersResult, providersResult, modelsResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", context.workspaceId).maybeSingle(),
		context.client.from("keys").select("id,name,prefix,status,created_at")
			.eq("workspace_id", context.workspaceId).neq("status", "deleted")
			.neq("name", "__chat_route_managed_key__").order("created_at", { ascending: false }),
		context.client.from("workspace_members").select("user_id,role,users(display_name)")
			.eq("workspace_id", context.workspaceId),
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
	const capabilitiesResult = modelsResult.data?.length
		? await context.client.from("v2_route_capabilities")
			.select("provider_model_id,capability_id,status,metadata")
			.in("capability_id", ["batch", "files.upload", "files.list", "files.retrieve"])
			.in("status", ["active", "deranked", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3"])
		: { data: [], error: null };
	if (capabilitiesResult.error) throw new Error("settings_unavailable");
	const modelMetadata = new Map((modelMetadataResult.data ?? []).map((row: any) => [String(row.model_slug), row]));
	const capabilitiesByProviderModel = new Map<string, Array<{ id: string; dataPolicy: Record<string, unknown> | null }>>();
	for (const row of capabilitiesResult.data ?? []) {
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
		keys: (keysResult.data ?? []).map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, status: key.status })),
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

const AUTO_ROUTING_OBJECTIVES = new Set(["balanced", "quality", "cost", "latency"]);
const AUTO_ROUTING_SPEND_PROFILES = new Set(["economy", "standard", "premium", "unrestricted", "custom"]);

function cleanAutoRoutingPatterns(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value
		.map((pattern) => typeof pattern === "string" ? pattern.trim().toLowerCase() : "")
		.filter(Boolean))]
		.slice(0, 16);
}

function priceLimit(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}

function autoRoutingFromRow(row: any) {
	const objective = String(row?.auto_routing_objective ?? "balanced");
	const spendProfile = String(row?.auto_routing_spend_profile ?? "standard");
	return {
		allowedPatterns: cleanAutoRoutingPatterns(row?.auto_routing_allowed_patterns),
		spendProfile: AUTO_ROUTING_SPEND_PROFILES.has(spendProfile) ? spendProfile : "standard",
		maxInputPricePerMillion: priceLimit(row?.auto_routing_max_input_price_per_million),
		maxOutputPricePerMillion: priceLimit(row?.auto_routing_max_output_price_per_million),
		objective: AUTO_ROUTING_OBJECTIVES.has(objective) ? objective : "balanced",
		allowFallbacks: row?.auto_routing_fallbacks_enabled !== false,
		revision: typeof row?.auto_routing_revision === "string" ? row.auto_routing_revision : null,
		updatedAt: typeof row?.auto_routing_updated_at === "string" ? row.auto_routing_updated_at : null,
	};
}

accountSettingsPolicyRouter.get("/chat/effective-policy", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ account: null, guardrails: [], workspace: null, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [workspaceResult, assignmentsResult] = await Promise.all([
		context.client.from("workspace_settings").select("provider_restriction_mode,provider_restriction_provider_ids,model_restriction_mode,model_restriction_model_ids").eq("workspace_id", workspaceId).maybeSingle(),
		context.client.from("workspace_member_guardrails").select("guardrail_id").eq("workspace_id", workspaceId).eq("user_id", context.user.id),
	]);
	if (workspaceResult.error || assignmentsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const guardrailIds = (assignmentsResult.data ?? []).map((row) => String(row.guardrail_id ?? "")).filter(Boolean);
	const guardrailsResult = guardrailIds.length
		? await context.client.from("workspace_guardrails").select("id,name,enabled,provider_restriction_mode,provider_restriction_provider_ids,model_restriction_mode,allowed_api_model_ids").eq("workspace_id", workspaceId).eq("enabled", true).in("id", guardrailIds)
		: { data: [], error: null };
	if (guardrailsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const normalize = (row: any, modelIdsKey = "model_restriction_model_ids") => ({
		provider: restriction(row?.provider_restriction_mode, row?.provider_restriction_provider_ids),
		model: restriction(row?.model_restriction_mode, row?.[modelIdsKey]),
	});
	return c.json({
		account: null,
		workspace: normalize(workspaceResult.data),
		guardrails: (guardrailsResult.data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name ?? "Guardrail"), ...normalize(row, "allowed_api_model_ids") })),
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/routing", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ responseHealingEnabled: false, responseHealingLocked: false, responseHealingMode: "safe", routingMode: "balanced", teamName: null, alphaChannelEnabled: false, betaChannelEnabled: false, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [teamResult, settingsResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
		context.client.from("workspace_settings").select("routing_mode,beta_channel_enabled,alpha_channel_enabled,response_healing_enabled,response_healing_locked,response_healing_mode").eq("workspace_id", workspaceId).maybeSingle(),
	]);
	if (teamResult.error || settingsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		responseHealingEnabled: Boolean(settingsResult.data?.response_healing_enabled),
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
			.select("auto_routing_allowed_patterns,auto_routing_spend_profile,auto_routing_max_input_price_per_million,auto_routing_max_output_price_per_million,auto_routing_objective,auto_routing_fallbacks_enabled,auto_routing_revision,auto_routing_updated_at")
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

	const rawPatterns = Array.isArray(body.allowedPatterns) ? body.allowedPatterns : [];
	const allowedPatterns = cleanAutoRoutingPatterns(rawPatterns);
	const invalidPatterns = rawPatterns
		.map((pattern) => String(pattern ?? "").trim().toLowerCase())
		.filter((pattern) => !pattern || pattern.length > 200 || !/^[a-z0-9*][a-z0-9._:/*-]*$/.test(pattern) || !pattern.includes("/"));
	const objective = String(body.objective ?? "balanced").trim().toLowerCase();
	const spendProfile = String(body.spendProfile ?? "standard").trim().toLowerCase();
	const maxInputPricePerMillion = priceLimit(body.maxInputPricePerMillion);
	const maxOutputPricePerMillion = priceLimit(body.maxOutputPricePerMillion);
	const allowFallbacks = body.allowFallbacks !== false;
	if (rawPatterns.length > 16 || invalidPatterns.length) {
		return c.json({ error: "invalid_model_patterns", patterns: invalidPatterns, maximum: 16 }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (!AUTO_ROUTING_OBJECTIVES.has(objective)) {
		return c.json({ error: "invalid_objective" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (!AUTO_ROUTING_SPEND_PROFILES.has(spendProfile)) {
		return c.json({ error: "invalid_spend_profile" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (spendProfile === "custom" && (maxInputPricePerMillion === null || maxOutputPricePerMillion === null)) {
		return c.json({ error: "custom_price_limits_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	const now = new Date().toISOString();
	const payload = {
		workspace_id: workspaceId,
		auto_routing_allowed_patterns: allowedPatterns,
		auto_routing_spend_profile: spendProfile,
		auto_routing_max_input_price_per_million: spendProfile === "custom" ? maxInputPricePerMillion : null,
		auto_routing_max_output_price_per_million: spendProfile === "custom" ? maxOutputPricePerMillion : null,
		auto_routing_objective: objective,
		auto_routing_fallbacks_enabled: allowFallbacks,
		auto_routing_revision: crypto.randomUUID(),
		auto_routing_updated_at: now,
		updated_at: now,
	};
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
		presets = await withPresetLifecycle(context.client, presetsResult.data ?? []).catch((error) => {
			console.warn("preset_lifecycle_enrichment_failed", error);
			return presetLifecycleFallback(presetsResult.data ?? []);
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
	const presets = await withPresetLifecycle(context.client, result.data ?? []).catch((error) => {
		console.warn("preset_lifecycle_enrichment_failed", error);
		return presetLifecycleFallback(result.data ?? []);
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

accountSettingsPolicyRouter.post("/presets", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim(); const name = String(body.name ?? "").trim(); const slug = normalizePresetSlug(body.slug ?? name);
	if (!workspaceId || !validPresetName(name) || !slug) return c.json({ error: "invalid_preset" }, 400, PRIVATE_NO_STORE_HEADERS);
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
	const client = getDataClient(c.env); const result = await client.from("presets").select("*").eq("id", c.req.param("presetId")).maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	if (result.data.workspace_id) { const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: result.data.workspace_id }); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); }
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
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (body.name != null) { const name = String(body.name).trim(); if (!validPresetName(name)) return c.json({ error: "invalid_preset" }, 400, PRIVATE_NO_STORE_HEADERS); update.draft_name = name; }
	if (body.description !== undefined) update.draft_description = body.description ? String(body.description).trim().slice(0, 500) : null;
	if (body.config !== undefined) update.draft_config = body.replaceConfig === true ? (body.config && typeof body.config === "object" ? body.config : {}) : { ...((existing.data.draft_config as Record<string, unknown>) ?? (existing.data.config as Record<string, unknown>) ?? {}), ...(body.config && typeof body.config === "object" ? body.config : {}) };
	if (body.visibility !== undefined) update.draft_visibility = presetVisibility(body.visibility);
	if (body.slug !== undefined) update.draft_slug = normalizePresetSlug(body.slug);
	if (["sequential", "semver", "date"].includes(String(body.versioningMethod))) update.versioning_method = String(body.versioningMethod);
	const nextSlug = String(update.draft_slug ?? existing.data.draft_slug ?? existing.data.slug ?? ""); const nextVisibility = String(update.draft_visibility ?? existing.data.draft_visibility ?? existing.data.visibility); if (!nextSlug) return c.json({ error: "invalid_preset_slug" }, 400, PRIVATE_NO_STORE_HEADERS);
	const publisher = nextVisibility === "public" ? await workspacePublisher(client, existing.data.workspace_id).catch(() => null) : null; if (nextVisibility === "public" && !publisher) return c.json({ error: "workspace_publisher_required" }, 409, PRIVATE_NO_STORE_HEADERS);
	const conflict = await presetSlugConflict(client, existing.data.workspace_id, nextSlug, id).catch(() => "error"); if (conflict === "error") return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (conflict) return c.json({ error: "duplicate_preset_slug", slug: nextSlug }, 409, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("presets").update(update).eq("id", id); if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const cache = await purgePresetCache(c, id); return c.json({ success: true, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/presets/:presetId/versions", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const id = c.req.param("presetId");
	const preset = await client.from("presets").select("workspace_id,created_by,visibility").eq("id", id).is("archived_at", null).maybeSingle();
	if (preset.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!preset.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: preset.data.workspace_id }); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (preset.data.visibility === "private" && preset.data.created_by !== user.id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const versions = await client.from("preset_versions").select("id,version_number,name,slug,description,visibility,release_notes,created_at").eq("preset_id", id).order("version_number", { ascending: false });
	if (versions.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ versions: versions.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.post("/presets/:presetId/versions", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const id = c.req.param("presetId"); const body: { releaseNotes?: string; versionLabel?: string } = await c.req.json<{ releaseNotes?: string; versionLabel?: string }>().catch(() => ({}));
	const preset = await client.from("presets").select("workspace_id,created_by,name,slug,description,config,visibility,draft_name,draft_slug,draft_description,draft_config,draft_visibility").eq("id", id).is("archived_at", null).maybeSingle();
	if (preset.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!preset.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: preset.data.workspace_id }); if (!context || !canWritePreset(context, user.id, preset.data)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!presetHasDraftChanges(preset.data)) return c.json({ error: "no_draft_changes" }, 409, PRIVATE_NO_STORE_HEADERS);
	if (preset.data.draft_visibility === "public" && !await workspacePublisher(client, preset.data.workspace_id).catch(() => null)) return c.json({ error: "workspace_publisher_required" }, 409, PRIVATE_NO_STORE_HEADERS);
	const published = await client.rpc("publish_preset_version", { target_preset_id: id, actor_user_id: user.id, notes: String(body.releaseNotes ?? "").slice(0, 1000), requested_label: body.versionLabel ? String(body.versionLabel).slice(0, 100) : null });
	if (published.error) {
		const message = published.error.message ?? "";
		if (message.includes("invalid_semver_label")) return c.json({ error: "invalid_semver_label" }, 400, PRIVATE_NO_STORE_HEADERS);
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
	const result = await client.from("presets").update({ archived_at: new Date().toISOString() }).eq("id", id); if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const cache = await purgePresetCache(c, id); return c.json({ success: true, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsPolicyRouter.get("/guardrails", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ activeProviderModels: [], guardrailKeyIdsByGuardrailId: {}, guardrailMemberIdsByGuardrailId: {}, guardrails: [], keys: [], members: [], providers: [], workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const [reference, guardrailsResult] = await Promise.all([
			loadGuardrailReference(context),
			context.client.from("workspace_guardrails").select(GUARDRAIL_COLUMNS).eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
		]);
		if (guardrailsResult.error) throw guardrailsResult.error;
		const guardrails = guardrailsResult.data ?? [];
		const ids = guardrails.map((guardrail) => guardrail.id).filter(Boolean);
		const keyMap = new Map<string, string[]>();
		const memberMap = new Map<string, string[]>();
		if (ids.length) {
			const [keyMappingsResult, memberMappingsResult] = await Promise.all([
				context.client.from("key_guardrails").select("guardrail_id,key_id").in("guardrail_id", ids),
				context.client.from("workspace_member_guardrails").select("guardrail_id,user_id").eq("workspace_id", workspaceId).in("guardrail_id", ids),
			]);
			if (keyMappingsResult.error) throw keyMappingsResult.error;
			if (memberMappingsResult.error) throw memberMappingsResult.error;
			for (const row of keyMappingsResult.data ?? []) {
				if (!row.guardrail_id || !row.key_id) continue;
				keyMap.set(row.guardrail_id, [...(keyMap.get(row.guardrail_id) ?? []), row.key_id]);
			}
			for (const row of memberMappingsResult.data ?? []) {
				if (!row.guardrail_id || !row.user_id) continue;
				memberMap.set(row.guardrail_id, [...(memberMap.get(row.guardrail_id) ?? []), row.user_id]);
			}
		}
		return c.json({ ...reference, guardrailKeyIdsByGuardrailId: Object.fromEntries(keyMap), guardrailMemberIdsByGuardrailId: Object.fromEntries(memberMap), guardrails, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsPolicyRouter.get("/guardrails/editor", async (c) => {
	const mode = c.req.query("mode") === "edit" ? "edit" : "create";
	const guardrailId = c.req.query("guardrailId")?.trim();
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ accountPolicy: accountPolicyFromRow(null), activeProviderModels: [], guardrail: null, initialKeyIds: [], initialMemberIds: [], keys: [], members: [], mode, providers: [], teamName: null, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
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
		let initialKeyIds: string[] = [];
		let initialMemberIds: string[] = [];
		if (mode === "edit" && guardrailResult.data?.id) {
			const [keyMappingsResult, memberMappingsResult] = await Promise.all([
				context.client.from("key_guardrails").select("key_id").eq("guardrail_id", guardrailResult.data.id),
				context.client.from("workspace_member_guardrails").select("user_id").eq("workspace_id", workspaceId).eq("guardrail_id", guardrailResult.data.id),
			]);
			if (keyMappingsResult.error) throw keyMappingsResult.error;
			if (memberMappingsResult.error) throw memberMappingsResult.error;
			initialKeyIds = (keyMappingsResult.data ?? []).map((row) => row.key_id).filter(Boolean);
			initialMemberIds = (memberMappingsResult.data ?? []).map((row) => row.user_id).filter(Boolean);
		}
		return c.json({ ...reference, accountPolicy: accountPolicyFromRow(workspacePolicyResult.data), guardrail: guardrailResult.data ?? null, initialKeyIds, initialMemberIds, mode, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

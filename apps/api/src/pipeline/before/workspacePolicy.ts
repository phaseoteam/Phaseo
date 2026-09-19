import { normalizeProviderList } from "@/lib/config/providerAliases";
import { isSyntheticWorkspace, readPublishedPolicy } from "@core/request-state/client";
import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";
import { keyVersionToken } from "@/core/kv";
import type { PriceCard } from "../pricing";
import type {
	ProviderCandidate,
	SensitiveInfoAction,
	SensitiveInfoRule,
	TeamSettings,
	WorkspacePolicy,
} from "./types";
import { normalizeDynamicRouteConfig, type DynamicRoutePolicy } from "./dynamic-routes";

type ProviderRestrictionMode = "none" | "allowlist" | "blocklist";

export function isOptionalDynamicRouteSchemaUnavailable(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const record = error as Record<string, unknown>;
	const code = String(record.code ?? "").trim().toUpperCase();
	const message = [record.message, record.details, record.hint]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
	const referencesDynamicRouteSchema =
		message.includes("gateway_dynamic_route_keys") ||
		message.includes("gateway_dynamic_routes");
	if (!referencesDynamicRouteSchema) return false;
	return (
		code === "42P01" ||
		code === "PGRST204" ||
		code === "PGRST205" ||
		message.includes("does not exist") ||
		message.includes("schema cache")
	);
}

type WorkspaceSettingsRow = {
	privacy_enable_paid_may_train?: boolean | null;
	privacy_enable_free_may_train?: boolean | null;
	privacy_enable_input_output_logging?: boolean | null;
	privacy_zdr_only?: boolean | null;
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
	model_restriction_mode?: string | null;
	model_restriction_model_ids?: string[] | null;
};

type GuardrailRow = {
	id: string;
	privacy_enable_paid_may_train?: boolean | null;
	privacy_enable_free_may_train?: boolean | null;
	privacy_enable_input_output_logging?: boolean | null;
	privacy_zdr_only?: boolean | null;
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
	model_restriction_mode?: string | null;
	allowed_api_model_ids?: string[] | null;
	prompt_injection_enabled?: boolean | null;
	prompt_injection_action?: string | null;
	sensitive_info_enabled?: boolean | null;
	sensitive_info_default_action?: string | null;
	sensitive_info_rules?: unknown;
};

type ProviderHintSet = {
	only: string[];
	ignore: string[];
};

const WORKSPACE_POLICY_L1_TTL_MS = 30_000;
const WORKSPACE_POLICY_L1_MAX_ENTRIES = 2_000;
const WORKSPACE_POLICY_KV_PREFIX = "gateway:workspace-policy:v2";
const WORKSPACE_POLICY_KV_TTL_SECONDS = 60;
const WORKSPACE_POLICY_VERSION_PREFIX = "gateway:workspace-policy-version";
const WORKSPACE_POLICY_VERSION_L1_TTL_MS = 5_000;

type WorkspacePolicyL1Entry = {
	expiresAt: number;
	value: WorkspacePolicy;
};

const workspacePolicyL1 = new Map<string, WorkspacePolicyL1Entry>();
const workspacePolicyVersionL1 = new Map<string, { value: number; expiresAt: number }>();

export type WorkspacePolicyDiagnostics = {
	resolvedModel: string;
	allowedApiModels: string[];
	blockedApiModels?: string[];
	providerAllowlist: string[];
	providerAllowlistConfigured: boolean;
	providerBlocklist: string[];
	requestProviderOnly: string[];
	requestProviderIgnore: string[];
	privacyZdrOnly: boolean;
	privacyEnablePaidMayTrain: boolean | null;
	privacyEnableFreeMayTrain: boolean | null;
	privacyEnableInputOutputLogging: boolean | null;
	droppedByPrivacy: Array<{
		providerId: string;
		reason:
			| "input_output_logging_disabled"
			| "paid_training_disabled"
			| "free_training_disabled"
			| "zdr_required"
			| "data_policy_unknown"
			| "data_policy_unverified";
		dataPolicyTier: string;
		dataPolicyConfidence: string;
		routeCostKind: "free" | "paid" | "unknown";
		capabilityPolicySource?: "provider" | "capability" | "capability_default";
		zdrEligibility?: "unknown" | "eligible" | "ineligible" | "conditional";
	}>;
	droppedProviders?: Array<{
		providerId: string;
		apiModelId: string | null;
		providerModelSlug: string | null;
		reason: string;
	}>;
	activeGuardrailIds: string[];
	beforeCount: number;
	afterCount: number;
};

function ttlWithJitter(baseMs: number): number {
	return baseMs + Math.floor(Math.random() * baseMs * 0.2);
}

function workspacePolicyVersionKey(workspaceId: string): string {
	return `${WORKSPACE_POLICY_VERSION_PREFIX}:${workspaceId}`;
}

function workspacePolicyCacheKey(workspaceId: string, apiKeyId: string, versionToken: string): string {
	return `${workspaceId}:${apiKeyId}:${versionToken}`;
}

function workspacePolicyKvKey(workspaceId: string, apiKeyId: string, versionToken: string): string {
	return `${WORKSPACE_POLICY_KV_PREFIX}:${workspaceId}:${apiKeyId}:${versionToken}`;
}

function readWorkspacePolicyVersionL1(workspaceId: string): number | null {
	const entry = workspacePolicyVersionL1.get(workspaceId);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		workspacePolicyVersionL1.delete(workspaceId);
		return null;
	}
	return entry.value;
}

function writeWorkspacePolicyVersionL1(workspaceId: string, value: number): void {
	workspacePolicyVersionL1.set(workspaceId, {
		value,
		expiresAt: Date.now() + ttlWithJitter(WORKSPACE_POLICY_VERSION_L1_TTL_MS),
	});
}

async function getWorkspacePolicyVersionToken(workspaceId: string): Promise<string> {
	const cached = readWorkspacePolicyVersionL1(workspaceId);
	if (cached !== null) return `v${cached}`;

	try {
		const raw = await getCache().get(workspacePolicyVersionKey(workspaceId), "text");
		const parsed = raw ? Number(raw) : 0;
		const normalized = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
		writeWorkspacePolicyVersionL1(workspaceId, normalized);
		return `v${normalized}`;
	} catch {
		return "v0";
	}
}

export async function bumpWorkspacePolicyVersion(workspaceId: string): Promise<number> {
	let current = 0;
	try {
		const raw = await getCache().get(workspacePolicyVersionKey(workspaceId), "text");
		const parsed = raw ? Number(raw) : 0;
		current = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
	} catch {
		current = 0;
	}
	const next = current + 1;
	await getCache().put(workspacePolicyVersionKey(workspaceId), String(next));
	writeWorkspacePolicyVersionL1(workspaceId, next);
	return next;
}

function isStringArrayOrNull(value: unknown): value is string[] | null {
	return value === null || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isWorkspacePolicyLike(value: unknown): value is WorkspacePolicy {
	if (!value || typeof value !== "object") return false;
	const policy = value as Partial<WorkspacePolicy>;
	return (
		isStringArrayOrNull(policy.providerAllowlist) &&
		isStringArrayOrNull(policy.providerBlocklist) &&
		isStringArrayOrNull(policy.allowedApiModels) &&
		isStringArrayOrNull(policy.blockedApiModels) &&
		(policy.promptInjectionAction === "flag" ||
			policy.promptInjectionAction === "redact" ||
			policy.promptInjectionAction === "block" ||
			policy.promptInjectionAction === null) &&
		Array.isArray(policy.promptInjectionGuardrailIds) &&
		policy.promptInjectionGuardrailIds.every((item) => typeof item === "string") &&
		Array.isArray(policy.sensitiveInfoRules) &&
		Array.isArray(policy.sensitiveInfoGuardrailIds) &&
		policy.sensitiveInfoGuardrailIds.every((item) => typeof item === "string") &&
		(policy.privacyEnablePaidMayTrain === undefined || typeof policy.privacyEnablePaidMayTrain === "boolean") &&
		(policy.privacyEnableFreeMayTrain === undefined || typeof policy.privacyEnableFreeMayTrain === "boolean") &&
		(policy.privacyEnableInputOutputLogging === undefined || typeof policy.privacyEnableInputOutputLogging === "boolean") &&
		(policy.privacyZdrOnly === undefined || typeof policy.privacyZdrOnly === "boolean") &&
		typeof policy.enforceAllowed === "boolean" &&
		(policy.dynamicRoute === null || policy.dynamicRoute === undefined || typeof policy.dynamicRoute === "object") &&
		Array.isArray(policy.activeGuardrailIds) &&
		policy.activeGuardrailIds.every((item) => typeof item === "string")
	);
}

function cloneWorkspacePolicy(policy: WorkspacePolicy): WorkspacePolicy {
	return {
		providerAllowlist: policy.providerAllowlist ? [...policy.providerAllowlist] : null,
		providerBlocklist: policy.providerBlocklist ? [...policy.providerBlocklist] : null,
		allowedApiModels: policy.allowedApiModels ? [...policy.allowedApiModels] : null,
		blockedApiModels: policy.blockedApiModels ? [...policy.blockedApiModels] : null,
		promptInjectionAction: policy.promptInjectionAction ?? null,
		promptInjectionGuardrailIds: [...policy.promptInjectionGuardrailIds],
		sensitiveInfoRules: [...policy.sensitiveInfoRules],
		sensitiveInfoGuardrailIds: [...policy.sensitiveInfoGuardrailIds],
		privacyEnablePaidMayTrain: policy.privacyEnablePaidMayTrain ?? true,
		privacyEnableFreeMayTrain: policy.privacyEnableFreeMayTrain ?? true,
		privacyEnableInputOutputLogging: policy.privacyEnableInputOutputLogging ?? true,
		privacyZdrOnly: policy.privacyZdrOnly ?? false,
		enforceAllowed: policy.enforceAllowed,
		activeGuardrailIds: [...policy.activeGuardrailIds],
		dynamicRoute: policy.dynamicRoute
			? { ...policy.dynamicRoute, config: normalizeDynamicRouteConfig(policy.dynamicRoute.config) }
			: null,
	};
}

function readWorkspacePolicyL1(workspaceId: string, apiKeyId: string, versionToken: string): WorkspacePolicy | null {
	const key = workspacePolicyCacheKey(workspaceId, apiKeyId, versionToken);
	const entry = workspacePolicyL1.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		workspacePolicyL1.delete(key);
		return null;
	}
	return cloneWorkspacePolicy(entry.value);
}

function writeWorkspacePolicyL1(
	workspaceId: string,
	apiKeyId: string,
	versionToken: string,
	value: WorkspacePolicy,
): void {
	const now = Date.now();
	for (const [key, entry] of workspacePolicyL1.entries()) {
		if (entry.expiresAt <= now) {
			workspacePolicyL1.delete(key);
		}
	}
	while (workspacePolicyL1.size >= WORKSPACE_POLICY_L1_MAX_ENTRIES) {
		const oldestKey = workspacePolicyL1.keys().next().value;
		if (!oldestKey) break;
		workspacePolicyL1.delete(oldestKey);
	}
	workspacePolicyL1.set(workspacePolicyCacheKey(workspaceId, apiKeyId, versionToken), {
		expiresAt: now + ttlWithJitter(WORKSPACE_POLICY_L1_TTL_MS),
		value: cloneWorkspacePolicy(value),
	});
}

function normalizeMode(value: unknown): ProviderRestrictionMode {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (
		normalized === "allowlist" ||
		normalized === "blocklist" ||
		normalized === "none"
	) {
		return normalized;
	}
	return "none";
}

function normalizeStringList(values: string[] | null | undefined): string[] {
	if (!Array.isArray(values)) return [];
	return values
		.map((value) => String(value ?? "").trim())
		.filter(Boolean);
}

function normalizeAction(value: unknown): SensitiveInfoAction | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (normalized === "flag" || normalized === "redact" || normalized === "block") {
		return normalized;
	}
	return null;
}

function actionRank(action: SensitiveInfoAction): number {
	if (action === "block") return 3;
	if (action === "redact") return 2;
	return 1;
}

function mostRestrictiveAction(
	current: SensitiveInfoAction | null,
	next: SensitiveInfoAction,
): SensitiveInfoAction {
	if (!current) return next;
	return actionRank(next) > actionRank(current) ? next : current;
}

function normalizeSensitiveInfoRule(
	value: unknown,
	defaultAction: SensitiveInfoAction,
): SensitiveInfoRule | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	if (raw.enabled === false) return null;

	const id = String(raw.id ?? "").trim();
	if (!id) return null;

	const action = normalizeAction(raw.action) ?? defaultAction;
	const kind = String(raw.kind ?? "builtin").trim().toLowerCase();
	if (kind === "custom") {
		const name = String(raw.name ?? "").trim();
		const pattern = String(raw.pattern ?? "").trim();
		if (!name || !pattern) return null;
		const flags = typeof raw.flags === "string" && raw.flags.trim() ? raw.flags.trim() : null;
		return { id, kind: "custom", action, name, pattern, flags };
	}

	return { id: id as SensitiveInfoRule["id"], kind: "builtin", action } as SensitiveInfoRule;
}

function sensitiveInfoRuleKey(rule: SensitiveInfoRule): string {
	return `${rule.kind}:${rule.id}`;
}

function intersectAllowlistSets(
	current: Set<string> | null,
	values: string[],
): Set<string> | null {
	const next = new Set(values);
	if (!current) return next;
	return new Set([...current].filter((value) => next.has(value)));
}

function extractProviderHints(body: any): ProviderHintSet {
	const provider = body?.provider;
	if (!provider || typeof provider !== "object") {
		return { only: [], ignore: [] };
	}

	return {
		only: normalizeProviderList(Array.isArray((provider as any).only) ? (provider as any).only : []),
		ignore: normalizeProviderList(
			Array.isArray((provider as any).ignore) ? (provider as any).ignore : [],
		),
	};
}

export function buildWorkspacePolicy(args: {
	globalSettings?: WorkspaceSettingsRow | null;
	guardrails?: GuardrailRow[];
	dynamicRoute?: DynamicRoutePolicy | null;
}): WorkspacePolicy {
	let providerAllowlist: Set<string> | null = null;
	const providerBlocklist = new Set<string>();
	let allowedApiModels: Set<string> | null = null;
	const blockedApiModels = new Set<string>();
	const sensitiveInfoRules = new Map<string, SensitiveInfoRule>();
	const sensitiveInfoGuardrailIds: string[] = [];
	let promptInjectionAction: SensitiveInfoAction | null = null;
	const promptInjectionGuardrailIds: string[] = [];
	let privacyEnablePaidMayTrain = true;
	let privacyEnableFreeMayTrain = true;
	let privacyEnableInputOutputLogging = true;
	let privacyZdrOnly = false;
	let enforceAllowed = false;

	privacyEnablePaidMayTrain = args.globalSettings?.privacy_enable_paid_may_train !== false;
	privacyEnableFreeMayTrain = args.globalSettings?.privacy_enable_free_may_train !== false;
	privacyEnableInputOutputLogging = args.globalSettings?.privacy_enable_input_output_logging !== false;
	privacyZdrOnly = args.globalSettings?.privacy_zdr_only === true;

	const globalMode = normalizeMode(args.globalSettings?.provider_restriction_mode);
	const globalProviderIds = normalizeProviderList(
		args.globalSettings?.provider_restriction_provider_ids ?? [],
	);
	if (globalMode === "allowlist") {
		providerAllowlist = intersectAllowlistSets(providerAllowlist, globalProviderIds);
	} else if (globalMode === "blocklist") {
		for (const providerId of globalProviderIds) {
			providerBlocklist.add(providerId);
		}
	}
	if (args.globalSettings?.provider_restriction_enforce_allowed) {
		enforceAllowed = true;
	}
	const globalModelMode = normalizeMode(args.globalSettings?.model_restriction_mode);
	const globalModelIds = normalizeStringList(args.globalSettings?.model_restriction_model_ids ?? []);
	if (globalModelMode === "allowlist") {
		allowedApiModels = intersectAllowlistSets(allowedApiModels, globalModelIds);
	} else if (globalModelMode === "blocklist") {
		for (const modelId of globalModelIds) blockedApiModels.add(modelId);
	}

	for (const guardrail of args.guardrails ?? []) {
		privacyEnablePaidMayTrain = privacyEnablePaidMayTrain && guardrail.privacy_enable_paid_may_train !== false;
		privacyEnableFreeMayTrain = privacyEnableFreeMayTrain && guardrail.privacy_enable_free_may_train !== false;
		privacyEnableInputOutputLogging = privacyEnableInputOutputLogging && guardrail.privacy_enable_input_output_logging !== false;
		privacyZdrOnly = privacyZdrOnly || guardrail.privacy_zdr_only === true;

		const mode = normalizeMode(guardrail.provider_restriction_mode);
		const providerIds = normalizeProviderList(
			guardrail.provider_restriction_provider_ids ?? [],
		);
		if (mode === "allowlist") {
			providerAllowlist = intersectAllowlistSets(providerAllowlist, providerIds);
		} else if (mode === "blocklist") {
			for (const providerId of providerIds) {
				providerBlocklist.add(providerId);
			}
		}

		const modelIds = normalizeStringList(guardrail.allowed_api_model_ids ?? []);
		const modelMode = normalizeMode(guardrail.model_restriction_mode);
		if (modelMode === "allowlist") {
			allowedApiModels = intersectAllowlistSets(allowedApiModels, modelIds);
		} else if (modelMode === "blocklist") {
			for (const modelId of modelIds) {
				blockedApiModels.add(modelId);
			}
		}
		if (guardrail.provider_restriction_enforce_allowed) {
			enforceAllowed = true;
		}
		if (guardrail.prompt_injection_enabled) {
			const action = normalizeAction(guardrail.prompt_injection_action) ?? "flag";
			promptInjectionAction = mostRestrictiveAction(promptInjectionAction, action);
			promptInjectionGuardrailIds.push(guardrail.id);
		}

		if (guardrail.sensitive_info_enabled) {
			const defaultAction = normalizeAction(guardrail.sensitive_info_default_action) ?? "flag";
			const rawRules = Array.isArray(guardrail.sensitive_info_rules)
				? guardrail.sensitive_info_rules
				: [];
			let includedRule = false;
			for (const rawRule of rawRules) {
				const rule = normalizeSensitiveInfoRule(rawRule, defaultAction);
				if (!rule) continue;
				includedRule = true;
				const key = sensitiveInfoRuleKey(rule);
				const existing = sensitiveInfoRules.get(key);
				if (existing) {
					sensitiveInfoRules.set(key, {
						...existing,
						action: mostRestrictiveAction(existing.action, rule.action),
					} as SensitiveInfoRule);
				} else {
					sensitiveInfoRules.set(key, rule);
				}
			}
			if (includedRule) {
				sensitiveInfoGuardrailIds.push(guardrail.id);
			}
		}
	}

	return {
		providerAllowlist:
			providerAllowlist ? [...providerAllowlist] : null,
		providerBlocklist:
			providerBlocklist.size > 0 ? [...providerBlocklist] : null,
		allowedApiModels:
			allowedApiModels ? [...allowedApiModels] : null,
		blockedApiModels: blockedApiModels.size > 0 ? [...blockedApiModels] : null,
		promptInjectionAction,
		promptInjectionGuardrailIds,
		sensitiveInfoRules: [...sensitiveInfoRules.values()],
		sensitiveInfoGuardrailIds,
		privacyEnablePaidMayTrain,
		privacyEnableFreeMayTrain,
		privacyEnableInputOutputLogging,
		privacyZdrOnly,
		enforceAllowed,
		activeGuardrailIds: (args.guardrails ?? []).map((guardrail) => guardrail.id),
		dynamicRoute: args.dynamicRoute ?? null,
	};
}

export async function fetchWorkspacePolicy(args: {
	workspaceId: string;
	apiKeyId: string;
}): Promise<WorkspacePolicy> {
	if (isSyntheticWorkspace(args.workspaceId)) return readPublishedPolicy(args);
	const [workspaceVersionToken, apiKeyVersionToken] = await Promise.all([
		getWorkspacePolicyVersionToken(args.workspaceId),
		keyVersionToken("id", args.apiKeyId, { useL1Cache: true, l1TtlMs: 5_000 }),
	]);
	const versionToken = `${workspaceVersionToken}:${apiKeyVersionToken}`;
	const cached = readWorkspacePolicyL1(args.workspaceId, args.apiKeyId, versionToken);
	if (cached) return cached;

	try {
		const raw = await getCache().get(
			workspacePolicyKvKey(args.workspaceId, args.apiKeyId, versionToken),
			"text",
		);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (isWorkspacePolicyLike(parsed)) {
				writeWorkspacePolicyL1(args.workspaceId, args.apiKeyId, versionToken, parsed);
				return cloneWorkspacePolicy(parsed);
			}
		}
	} catch {
		// Ignore cache read failures and use the source of truth.
	}

	const supabase = getSupabaseAdmin();
	const [settingsResult, keyResult, keyGuardrailsResult, routeLinkResult] = await Promise.all([
		supabase
			.from("workspace_settings")
			.select(
				"privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed,model_restriction_mode,model_restriction_model_ids",
			)
			.eq("workspace_id", args.workspaceId)
			.maybeSingle(),
		supabase
			.from("keys")
			.select("created_by,oauth_user_id")
			.eq("id", args.apiKeyId)
			.eq("workspace_id", args.workspaceId)
			.maybeSingle(),
		supabase
			.from("key_guardrails")
			.select("guardrail_id")
			.eq("key_id", args.apiKeyId),
		supabase
			.from("gateway_dynamic_route_keys")
			.select("route_id")
			.eq("key_id", args.apiKeyId)
			.maybeSingle(),
	]);

	if (settingsResult.error) {
		throw new Error(`workspace_settings_lookup_failed:${settingsResult.error.message}`);
	}
	if (keyResult.error) {
		throw new Error(`key_principal_lookup_failed:${keyResult.error.message}`);
	}
	if (keyGuardrailsResult.error) {
		throw new Error(`key_guardrails_lookup_failed:${keyGuardrailsResult.error.message}`);
	}
	if (routeLinkResult.error) {
		if (isOptionalDynamicRouteSchemaUnavailable(routeLinkResult.error)) {
			console.warn("[fetchWorkspacePolicy] dynamic_route_schema_unavailable", {
				workspaceId: args.workspaceId,
				code: routeLinkResult.error.code ?? null,
			});
		} else {
			throw new Error(`dynamic_route_link_lookup_failed:${routeLinkResult.error.message}`);
		}
	}

	const principalUserId = String(keyResult.data?.oauth_user_id ?? keyResult.data?.created_by ?? "").trim();
	let memberGuardrailIds: string[] = [];
	if (principalUserId) {
		const memberGuardrailsResult = await supabase
			.from("workspace_member_guardrails")
			.select("guardrail_id")
			.eq("workspace_id", args.workspaceId)
			.eq("user_id", principalUserId);
		if (memberGuardrailsResult.error) {
			throw new Error(`workspace_member_guardrails_lookup_failed:${memberGuardrailsResult.error.message}`);
		}
		memberGuardrailIds = (memberGuardrailsResult.data ?? [])
			.map((row: any) => String(row?.guardrail_id ?? "").trim())
			.filter(Boolean);
	}

	const guardrailIds = [...new Set([...(keyGuardrailsResult.data ?? [])
		.map((row: any) => String(row?.guardrail_id ?? "").trim())
		.filter(Boolean), ...memberGuardrailIds])];

	let guardrails: GuardrailRow[] = [];
	if (guardrailIds.length > 0) {
		const guardrailsResult = await supabase
			.from("workspace_guardrails")
			.select(
				"id,privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed,model_restriction_mode,allowed_api_model_ids,prompt_injection_enabled,prompt_injection_action,sensitive_info_enabled,sensitive_info_default_action,sensitive_info_rules",
			)
			.eq("workspace_id", args.workspaceId)
			.eq("enabled", true)
			.in("id", guardrailIds);

		if (guardrailsResult.error) {
			throw new Error(`workspace_guardrails_lookup_failed:${guardrailsResult.error.message}`);
		}

		guardrails = (guardrailsResult.data ?? []) as GuardrailRow[];
	}

	let dynamicRoute: DynamicRoutePolicy | null = null;
	const routeId = String(routeLinkResult.data?.route_id ?? "").trim();
	if (routeId) {
		const routeResult = await supabase
			.from("gateway_dynamic_routes")
			.select("id,name,version,deployed_version,config,status")
			.eq("id", routeId)
			.eq("workspace_id", args.workspaceId)
			.maybeSingle();
		if (routeResult.error) {
			if (isOptionalDynamicRouteSchemaUnavailable(routeResult.error)) {
				console.warn("[fetchWorkspacePolicy] dynamic_route_schema_unavailable", {
					workspaceId: args.workspaceId,
					code: routeResult.error.code ?? null,
				});
			} else {
				throw new Error(`dynamic_route_lookup_failed:${routeResult.error.message}`);
			}
		}
		if (!routeResult.error && routeResult.data && routeResult.data.status === "active" && routeResult.data.deployed_version) {
			dynamicRoute = {
				id: routeResult.data.id,
				name: routeResult.data.name,
				version: Number(routeResult.data.deployed_version) || 1,
				config: normalizeDynamicRouteConfig(routeResult.data.config),
			};
		}
	}

	const policy = buildWorkspacePolicy({
		globalSettings: (settingsResult.data ?? null) as WorkspaceSettingsRow | null,
		guardrails,
		dynamicRoute,
	});
	writeWorkspacePolicyL1(args.workspaceId, args.apiKeyId, versionToken, policy);
	dispatchBackground(
		getCache()
			.put(
				workspacePolicyKvKey(args.workspaceId, args.apiKeyId, versionToken),
				JSON.stringify(policy),
				{ expirationTtl: WORKSPACE_POLICY_KV_TTL_SECONDS },
			),
	);
	return policy;
}

export function applyWorkspacePolicy(args: {
	providers: ProviderCandidate[];
	resolvedModel: string;
	body: any;
	workspacePolicy: WorkspacePolicy | null;
	teamSettings?: TeamSettings | null;
}):
	| {
			ok: true;
			providers: ProviderCandidate[];
			diagnostics: WorkspacePolicyDiagnostics;
	  }
	| {
			ok: false;
			reason: "model_not_allowed" | "no_providers";
			diagnostics: WorkspacePolicyDiagnostics;
	  } {
	const workspacePolicy = args.workspacePolicy;
	const hints = extractProviderHints(args.body);
	const effectivePrivacy = {
		privacyEnablePaidMayTrain:
			args.teamSettings?.privacyEnablePaidMayTrain !== false &&
			workspacePolicy?.privacyEnablePaidMayTrain !== false,
		privacyEnableFreeMayTrain:
			args.teamSettings?.privacyEnableFreeMayTrain !== false &&
			workspacePolicy?.privacyEnableFreeMayTrain !== false,
		privacyEnableInputOutputLogging:
			args.teamSettings?.privacyEnableInputOutputLogging !== false &&
			workspacePolicy?.privacyEnableInputOutputLogging !== false,
		privacyZdrOnly:
			Boolean(args.teamSettings?.privacyZdrOnly) || Boolean(workspacePolicy?.privacyZdrOnly),
	};
	const diagnostics: WorkspacePolicyDiagnostics = {
		resolvedModel: args.resolvedModel,
		allowedApiModels: workspacePolicy?.allowedApiModels ?? [],
		blockedApiModels: workspacePolicy?.blockedApiModels ?? [],
		providerAllowlist: workspacePolicy?.providerAllowlist ?? [],
		providerAllowlistConfigured: Boolean(workspacePolicy?.providerAllowlist),
		providerBlocklist: workspacePolicy?.providerBlocklist ?? [],
		requestProviderOnly: hints.only,
		requestProviderIgnore: hints.ignore,
		privacyZdrOnly: effectivePrivacy.privacyZdrOnly,
		privacyEnablePaidMayTrain: effectivePrivacy.privacyEnablePaidMayTrain,
		privacyEnableFreeMayTrain: effectivePrivacy.privacyEnableFreeMayTrain,
		privacyEnableInputOutputLogging: effectivePrivacy.privacyEnableInputOutputLogging,
		droppedByPrivacy: [],
		activeGuardrailIds: workspacePolicy?.activeGuardrailIds ?? [],
		beforeCount: args.providers.length,
		afterCount: args.providers.length,
	};

	let filtered = [...args.providers];
	const filterProviders = (
		predicate: (provider: ProviderCandidate) => boolean,
		reason: string,
	) => {
		const removed = filtered.filter((provider) => !predicate(provider));
		if (removed.length > 0) {
			diagnostics.droppedProviders ??= [];
			diagnostics.droppedProviders.push(...removed.map((provider) => ({
				providerId: provider.providerId,
				apiModelId: provider.apiModelId ?? null,
				providerModelSlug: provider.providerModelSlug ?? null,
				reason,
			})));
		}
		filtered = filtered.filter(predicate);
	};

	if (workspacePolicy?.allowedApiModels) {
		const allowSet = new Set(workspacePolicy.allowedApiModels);
		if (!allowSet.has(args.resolvedModel)) {
			filterProviders(
				(provider) => Boolean(provider.apiModelId && allowSet.has(provider.apiModelId)),
				"model_not_in_allowlist",
			);
			if (!filtered.length) {
				diagnostics.afterCount = 0;
				return {
					ok: false,
					reason: "model_not_allowed",
					diagnostics,
				};
			}
		}
	}

	if (workspacePolicy?.blockedApiModels?.length) {
		const blockSet = new Set(workspacePolicy.blockedApiModels);
		if (blockSet.has(args.resolvedModel)) {
			diagnostics.afterCount = 0;
			return {
				ok: false,
				reason: "model_not_allowed",
				diagnostics,
			};
		}
		filterProviders(
			(provider) => !(provider.apiModelId && blockSet.has(provider.apiModelId)),
			"model_in_blocklist",
		);
	}

	if (workspacePolicy?.providerAllowlist) {
		const allowSet = new Set(workspacePolicy.providerAllowlist);
		filterProviders((provider) => allowSet.has(provider.providerId), "provider_not_in_allowlist");
	}

	if (workspacePolicy?.providerBlocklist?.length) {
		const blockSet = new Set(workspacePolicy.providerBlocklist);
		filterProviders((provider) => !blockSet.has(provider.providerId), "provider_in_blocklist");
	}

	if (hints.only.length) {
		const allowSet = new Set(hints.only);
		filterProviders((provider) => allowSet.has(provider.providerId), "not_in_provider_only");
	}

	if (hints.ignore.length) {
		const blockSet = new Set(hints.ignore);
		filterProviders((provider) => !blockSet.has(provider.providerId), "listed_in_provider_ignore");
	}

	filtered = applyProviderDataPolicySettings({
		providers: filtered,
		settings: effectivePrivacy,
		diagnostics,
	});

	diagnostics.afterCount = filtered.length;
	if (!filtered.length) {
		return {
			ok: false,
			reason: "no_providers",
			diagnostics,
		};
	}

	return {
		ok: true,
		providers: filtered,
		diagnostics,
	};
}

type ProviderDataPolicyTier = "unknown" | "private" | "logs" | "trains";
type ProviderDataPolicyConfidence = "unknown" | "confirmed" | "maybe";
type ProviderRouteCostKind = "free" | "paid" | "unknown";

function normalizeDataPolicyTier(value: unknown): ProviderDataPolicyTier {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "private" || normalized === "logs" || normalized === "trains") {
		return normalized;
	}
	return "unknown";
}

function normalizeDataPolicyConfidence(value: unknown): ProviderDataPolicyConfidence {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "confirmed" || normalized === "maybe") return normalized;
	return "unknown";
}

function normalizePromptTrainingPolicy(value: unknown): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (
		normalized === "no_train" ||
		normalized === "may_train" ||
		normalized === "opt_out_available" ||
		normalized === "enterprise_no_train"
	) {
		return normalized;
	}
	return "unknown";
}

function deriveDataPolicyTier(provider: ProviderCandidate): ProviderDataPolicyTier {
	const explicitTier = normalizeDataPolicyTier(provider.dataPolicyTier);
	if (explicitTier !== "unknown") return explicitTier;

	const promptTrainingPolicy = normalizePromptTrainingPolicy(provider.promptTrainingPolicy);
	if (promptTrainingPolicy === "may_train" || promptTrainingPolicy === "opt_out_available") {
		return "trains";
	}
	if (promptTrainingPolicy === "no_train" || promptTrainingPolicy === "enterprise_no_train") {
		return provider.zeroDataRetention === true ? "private" : "logs";
	}
	return "unknown";
}

function priceRuleIsPositive(rule: PriceCard["rules"][number]): boolean {
	const raw = Number(rule.price_per_unit);
	return Number.isFinite(raw) && raw > 0;
}

function routeCostKind(pricingCard: PriceCard | null | undefined): ProviderRouteCostKind {
	if (!pricingCard || !Array.isArray(pricingCard.rules) || pricingCard.rules.length === 0) {
		return "unknown";
	}
	return pricingCard.rules.some(priceRuleIsPositive) ? "paid" : "free";
}

function applyProviderDataPolicySettings(args: {
	providers: ProviderCandidate[];
	settings: {
		privacyEnableInputOutputLogging: boolean;
		privacyEnablePaidMayTrain: boolean;
		privacyEnableFreeMayTrain: boolean;
		privacyZdrOnly: boolean;
	};
	diagnostics: WorkspacePolicyDiagnostics;
}): ProviderCandidate[] {
	const settings = args.settings;

	const allowInputOutputLogging = settings.privacyEnableInputOutputLogging !== false;
	const allowPaidMayTrain = settings.privacyEnablePaidMayTrain !== false;
	const allowFreeMayTrain = settings.privacyEnableFreeMayTrain !== false;

	if (allowInputOutputLogging && allowPaidMayTrain && allowFreeMayTrain && !settings.privacyZdrOnly) {
		return args.providers;
	}

	const filtered: ProviderCandidate[] = [];
	for (const provider of args.providers) {
		const tier = deriveDataPolicyTier(provider);
		const confidence = normalizeDataPolicyConfidence(provider.dataPolicyConfidence);
		const costKind = routeCostKind(provider.pricingCard);
		let reason: WorkspacePolicyDiagnostics["droppedByPrivacy"][number]["reason"] | null = null;

		if (settings.privacyZdrOnly && provider.zeroDataRetention !== true) {
			reason = "zdr_required";
		} else if (tier === "unknown") {
			reason = "data_policy_unknown";
		} else if (confidence !== "confirmed") {
			reason = "data_policy_unverified";
		} else if (!allowInputOutputLogging && tier === "logs") {
			reason = "input_output_logging_disabled";
		} else if (tier === "trains") {
			if (costKind === "free" && !allowFreeMayTrain) {
				reason = "free_training_disabled";
			} else if ((costKind === "paid" || costKind === "unknown") && !allowPaidMayTrain) {
				reason = "paid_training_disabled";
			}
		}

		if (reason) {
		args.diagnostics.droppedByPrivacy.push({
			providerId: provider.providerId,
			reason,
			dataPolicyTier: tier,
			dataPolicyConfidence: confidence,
			routeCostKind: costKind,
			capabilityPolicySource: provider.effectiveDataPolicy?.source,
			zdrEligibility: provider.effectiveDataPolicy?.zdrEligibility,
		});
		continue;
		}

		filtered.push(provider);
	}

	return filtered;
}

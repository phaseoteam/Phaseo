import { normalizeProviderList } from "@/lib/config/providerAliases";
import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";
import type { ProviderCandidate, WorkspacePolicy } from "./types";

type ProviderRestrictionMode = "none" | "allowlist" | "blocklist";

type WorkspaceSettingsRow = {
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
};

type GuardrailRow = {
	id: string;
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
	allowed_api_model_ids?: string[] | null;
};

type ProviderHintSet = {
	only: string[];
	ignore: string[];
};

const WORKSPACE_POLICY_L1_TTL_MS = 30_000;
const WORKSPACE_POLICY_L1_MAX_ENTRIES = 2_000;
const WORKSPACE_POLICY_KV_PREFIX = "gateway:workspace-policy";
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
	providerAllowlist: string[];
	providerBlocklist: string[];
	requestProviderOnly: string[];
	requestProviderIgnore: string[];
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
		typeof policy.enforceAllowed === "boolean" &&
		Array.isArray(policy.activeGuardrailIds) &&
		policy.activeGuardrailIds.every((item) => typeof item === "string")
	);
}

function cloneWorkspacePolicy(policy: WorkspacePolicy): WorkspacePolicy {
	return {
		providerAllowlist: policy.providerAllowlist ? [...policy.providerAllowlist] : null,
		providerBlocklist: policy.providerBlocklist ? [...policy.providerBlocklist] : null,
		allowedApiModels: policy.allowedApiModels ? [...policy.allowedApiModels] : null,
		enforceAllowed: policy.enforceAllowed,
		activeGuardrailIds: [...policy.activeGuardrailIds],
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

function intersectSets(
	current: Set<string> | null,
	values: string[],
): Set<string> | null {
	if (!values.length) return current;
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
}): WorkspacePolicy {
	let providerAllowlist: Set<string> | null = null;
	const providerBlocklist = new Set<string>();
	let allowedApiModels: Set<string> | null = null;
	let enforceAllowed = false;

	const globalMode = normalizeMode(args.globalSettings?.provider_restriction_mode);
	const globalProviderIds = normalizeProviderList(
		args.globalSettings?.provider_restriction_provider_ids ?? [],
	);
	if (globalMode === "allowlist") {
		providerAllowlist = intersectSets(providerAllowlist, globalProviderIds);
	} else if (globalMode === "blocklist") {
		for (const providerId of globalProviderIds) {
			providerBlocklist.add(providerId);
		}
	}
	if (args.globalSettings?.provider_restriction_enforce_allowed) {
		enforceAllowed = true;
	}

	for (const guardrail of args.guardrails ?? []) {
		const mode = normalizeMode(guardrail.provider_restriction_mode);
		const providerIds = normalizeProviderList(
			guardrail.provider_restriction_provider_ids ?? [],
		);
		if (mode === "allowlist") {
			providerAllowlist = intersectSets(providerAllowlist, providerIds);
		} else if (mode === "blocklist") {
			for (const providerId of providerIds) {
				providerBlocklist.add(providerId);
			}
		}

		allowedApiModels = intersectSets(
			allowedApiModels,
			normalizeStringList(guardrail.allowed_api_model_ids ?? []),
		);
		if (guardrail.provider_restriction_enforce_allowed) {
			enforceAllowed = true;
		}
	}

	return {
		providerAllowlist:
			providerAllowlist && providerAllowlist.size > 0
				? [...providerAllowlist]
				: null,
		providerBlocklist:
			providerBlocklist.size > 0 ? [...providerBlocklist] : null,
		allowedApiModels:
			allowedApiModels && allowedApiModels.size > 0
				? [...allowedApiModels]
				: null,
		enforceAllowed,
		activeGuardrailIds: (args.guardrails ?? []).map((guardrail) => guardrail.id),
	};
}

export async function fetchWorkspacePolicy(args: {
	workspaceId: string;
	apiKeyId: string;
}): Promise<WorkspacePolicy> {
	const versionToken = await getWorkspacePolicyVersionToken(args.workspaceId);
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
	const [settingsResult, keyGuardrailsResult] = await Promise.all([
		supabase
			.from("workspace_settings")
			.select(
				"provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed",
			)
			.eq("workspace_id", args.workspaceId)
			.maybeSingle(),
		supabase
			.from("key_guardrails")
			.select("guardrail_id")
			.eq("key_id", args.apiKeyId),
	]);

	if (settingsResult.error) {
		throw new Error(`workspace_settings_lookup_failed:${settingsResult.error.message}`);
	}
	if (keyGuardrailsResult.error) {
		throw new Error(`key_guardrails_lookup_failed:${keyGuardrailsResult.error.message}`);
	}

	const guardrailIds = (keyGuardrailsResult.data ?? [])
		.map((row: any) => String(row?.guardrail_id ?? "").trim())
		.filter(Boolean);

	let guardrails: GuardrailRow[] = [];
	if (guardrailIds.length > 0) {
		const guardrailsResult = await supabase
			.from("workspace_guardrails")
			.select(
				"id,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed,allowed_api_model_ids",
			)
			.eq("workspace_id", args.workspaceId)
			.eq("enabled", true)
			.in("id", guardrailIds);

		if (guardrailsResult.error) {
			throw new Error(`workspace_guardrails_lookup_failed:${guardrailsResult.error.message}`);
		}

		guardrails = (guardrailsResult.data ?? []) as GuardrailRow[];
	}

	const policy = buildWorkspacePolicy({
		globalSettings: (settingsResult.data ?? null) as WorkspaceSettingsRow | null,
		guardrails,
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
	const diagnostics: WorkspacePolicyDiagnostics = {
		resolvedModel: args.resolvedModel,
		allowedApiModels: workspacePolicy?.allowedApiModels ?? [],
		providerAllowlist: workspacePolicy?.providerAllowlist ?? [],
		providerBlocklist: workspacePolicy?.providerBlocklist ?? [],
		requestProviderOnly: hints.only,
		requestProviderIgnore: hints.ignore,
		activeGuardrailIds: workspacePolicy?.activeGuardrailIds ?? [],
		beforeCount: args.providers.length,
		afterCount: args.providers.length,
	};

	if (
		workspacePolicy?.allowedApiModels?.length &&
		!workspacePolicy.allowedApiModels.includes(args.resolvedModel)
	) {
		diagnostics.afterCount = 0;
		return {
			ok: false,
			reason: "model_not_allowed",
			diagnostics,
		};
	}

	let filtered = [...args.providers];

	if (workspacePolicy?.providerAllowlist?.length) {
		const allowSet = new Set(workspacePolicy.providerAllowlist);
		filtered = filtered.filter((provider) => allowSet.has(provider.providerId));
	}

	if (workspacePolicy?.providerBlocklist?.length) {
		const blockSet = new Set(workspacePolicy.providerBlocklist);
		filtered = filtered.filter((provider) => !blockSet.has(provider.providerId));
	}

	if (hints.only.length) {
		const allowSet = new Set(hints.only);
		filtered = filtered.filter((provider) => allowSet.has(provider.providerId));
	}

	if (hints.ignore.length) {
		const blockSet = new Set(hints.ignore);
		filtered = filtered.filter((provider) => !blockSet.has(provider.providerId));
	}

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

import { normalizeProviderList } from "@/lib/config/providerAliases";
import { getSupabaseAdmin } from "@/runtime/env";
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

	return buildWorkspacePolicy({
		globalSettings: (settingsResult.data ?? null) as WorkspaceSettingsRow | null,
		guardrails,
	});
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

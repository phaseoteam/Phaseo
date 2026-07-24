export type ResidencyMode =
	| "unknown"
	| "provider_managed"
	| "customer_selectable"
	| "account_selected";

export type ZeroDataRetentionMode =
	| "unknown"
	| "unsupported"
	| "optional"
	| "default";

export type ProviderResidencyMetadata = {
	residencyMode: ResidencyMode | null;
	executionRegions: string[] | null;
	dataRegions: string[] | null;
	zeroDataRetention: ZeroDataRetentionMode | null;
	residencyNotes: string | null;
	residencySourceUrl: string | null;
};

export type ResidencyRequirement = {
	requiredExecutionRegion?: string | null;
	requiredDataRegion?: string | null;
	requireZeroDataRetention?: boolean | null;
};

type ProviderResidencyOverride = Partial<ProviderResidencyMetadata>;

const PROVIDER_RESIDENCY_DEFAULTS: Record<string, ProviderResidencyMetadata> = {
	openai: {
		residencyMode: "customer_selectable",
		executionRegions: null,
		dataRegions: null,
		zeroDataRetention: "optional",
		residencyNotes:
			"OpenAI data residency requires a region-bound project and the corresponding regional API domain on supported endpoints/models. The default gateway OpenAI integration does not switch regions per request.",
		residencySourceUrl: "https://developers.openai.com/api/docs/guides/your-data",
	},
	"openai-eu": {
		residencyMode: "provider_managed",
		executionRegions: ["eu"],
		dataRegions: ["eu"],
		zeroDataRetention: "optional",
		residencyNotes:
			"Modeled EU OpenAI offer. Regional processing requires an EU project and the eu.api.openai.com domain on supported endpoints/models.",
		residencySourceUrl: "https://developers.openai.com/api/docs/guides/your-data",
	},
	anthropic: {
		residencyMode: "customer_selectable",
		executionRegions: ["global"],
		dataRegions: ["us"],
		zeroDataRetention: "optional",
		residencyNotes:
			"Anthropic supports global or US-only inference on supported 4.6+ models via inference_geo, but the default gateway Anthropic provider routes globally unless a US-specific offer is selected.",
		residencySourceUrl:
			"https://platform.claude.com/docs/en/manage-claude/data-residency",
	},
	"anthropic-us": {
		residencyMode: "provider_managed",
		executionRegions: ["us"],
		dataRegions: ["us"],
		zeroDataRetention: "optional",
		residencyNotes:
			"US-only inference offer for Anthropic first-party API requests. Selected requests must send inference_geo=us.",
		residencySourceUrl:
			"https://platform.claude.com/docs/en/manage-claude/data-residency",
	},
	"anthropic-aws": {
		residencyMode: "customer_selectable",
		executionRegions: ["global", "us"],
		dataRegions: null,
		zeroDataRetention: "optional",
		residencyNotes:
			"Claude Platform on AWS uses Anthropic-operated infrastructure. Inference defaults to global and can be pinned to US with inference_geo on supported models.",
		residencySourceUrl:
			"https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws",
	},
	"anthropic-aws-us": {
		residencyMode: "provider_managed",
		executionRegions: ["us"],
		dataRegions: null,
		zeroDataRetention: "optional",
		residencyNotes:
			"US-only inference offer for Claude Platform on AWS on supported 4.6+ models.",
		residencySourceUrl:
			"https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws",
	},
	"google-vertex": {
		residencyMode: "customer_selectable",
		executionRegions: null,
		dataRegions: null,
		zeroDataRetention: "unknown",
		residencyNotes:
			"Vertex AI generative workloads run in the location or multi-region used for the request. The default gateway Vertex integration uses a single configured location and does not switch locations per request.",
		residencySourceUrl:
			"https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency",
	},
	"google-vertex-eu": {
		residencyMode: "provider_managed",
		executionRegions: ["eu"],
		dataRegions: ["eu"],
		zeroDataRetention: "unknown",
		residencyNotes:
			"Modeled EU Vertex AI offer. ML processing occurs in the EU location or multi-region used for the request.",
		residencySourceUrl:
			"https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency",
	},
	tensorix: {
		residencyMode: "provider_managed",
		executionRegions: ["eu"],
		dataRegions: ["eu"],
		zeroDataRetention: "default",
		residencyNotes: "EU-hosted infrastructure with zero data retention.",
		residencySourceUrl: "https://docs.tensorix.ai/",
	},
};

const PROVIDER_MODEL_RESIDENCY_OVERRIDES: Record<string, ProviderResidencyOverride> = {};

function normalizeRegionList(value: string[] | null | undefined): string[] | null {
	if (!Array.isArray(value)) return null;
	const normalized = Array.from(
		new Set(
			value
				.map((entry) => String(entry ?? "").trim().toLowerCase())
				.filter(Boolean),
		),
	);
	return normalized.length > 0 ? normalized : null;
}

function mergeMetadata(
	base: ProviderResidencyMetadata,
	override: ProviderResidencyOverride | null | undefined,
): ProviderResidencyMetadata {
	if (!override) return base;
	return {
		residencyMode: override.residencyMode ?? base.residencyMode,
		executionRegions:
			normalizeRegionList(override.executionRegions) ?? base.executionRegions,
		dataRegions: normalizeRegionList(override.dataRegions) ?? base.dataRegions,
		zeroDataRetention: override.zeroDataRetention ?? base.zeroDataRetention,
		residencyNotes: override.residencyNotes ?? base.residencyNotes,
		residencySourceUrl: override.residencySourceUrl ?? base.residencySourceUrl,
	};
}

export function getProviderResidencyMetadata(args: {
	providerId: string;
	providerModelSlug?: string | null;
}): ProviderResidencyMetadata {
	const providerId = String(args.providerId ?? "").trim().toLowerCase();
	const providerModelSlug = String(args.providerModelSlug ?? "").trim().toLowerCase();
	const base =
		PROVIDER_RESIDENCY_DEFAULTS[providerId] ?? {
			residencyMode: "unknown",
			executionRegions: null,
			dataRegions: null,
			zeroDataRetention: "unknown",
			residencyNotes: null,
			residencySourceUrl: null,
		};
	const overrideKey = `${providerId}::${providerModelSlug}`;
	return mergeMetadata(base, PROVIDER_MODEL_RESIDENCY_OVERRIDES[overrideKey]);
}

function includesRegion(
	regions: string[] | null | undefined,
	requiredRegion: string | null | undefined,
): boolean {
	if (!requiredRegion) return true;
	const normalizedRequired = String(requiredRegion).trim().toLowerCase();
	if (!normalizedRequired) return true;
	if (!Array.isArray(regions) || regions.length === 0) return false;
	return regions.some((region) => region.toLowerCase() === normalizedRequired);
}

export function providerMeetsResidencyRequirement(
	metadata: ProviderResidencyMetadata,
	requirement: ResidencyRequirement,
): { ok: boolean; reason: string | null } {
	if (
		requirement.requiredExecutionRegion &&
		!includesRegion(metadata.executionRegions, requirement.requiredExecutionRegion)
	) {
		return { ok: false, reason: "execution_region_mismatch" };
	}
	if (
		requirement.requiredDataRegion &&
		!includesRegion(metadata.dataRegions, requirement.requiredDataRegion)
	) {
		return { ok: false, reason: "data_region_mismatch" };
	}
	if (requirement.requireZeroDataRetention) {
		const zdr = metadata.zeroDataRetention ?? "unknown";
		// "optional" only means the provider can offer ZDR. Without route-specific
		// evidence that it is enabled for the credential/account, it is not a guarantee.
		if (zdr !== "default") {
			return { ok: false, reason: "zero_data_retention_unsupported" };
		}
	}
	return { ok: true, reason: null };
}

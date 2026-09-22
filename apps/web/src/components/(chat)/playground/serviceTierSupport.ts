import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { ChatServiceTier } from "@/lib/indexeddb/chats";

export type ServiceTierSupport = {
	supportedValues: ChatServiceTier[];
	defaultValue?: ChatServiceTier;
};

export type ServiceTierOption = {
	value: ChatServiceTier;
	label: string;
};

export const SERVICE_TIER_OPTIONS: ServiceTierOption[] = [
	{ value: "standard", label: "Standard" },
	{ value: "priority", label: "Fast" },
	{ value: "flex", label: "Flex" },
];

const SERVICE_TIER_ORDER: ChatServiceTier[] = [
	"standard",
	"priority",
	"flex",
];

const TEXT_GENERATION_CAPABILITY_IDS = new Set([
	"text.generate",
	"responses",
	"chat.completions",
	"text.completions",
	"completions",
]);

const SERVICE_TIER_PARAMETER_IDS = new Set([
	"service_tier",
	"service-tier",
	"service.tier",
	"servicetier",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeParameterId(value: unknown) {
	return typeof value === "string"
		? value.trim().toLowerCase().replace(/-/g, "_")
		: "";
}

function parseServiceTier(value: unknown): ChatServiceTier | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === "standard" ||
		normalized === "default" ||
		normalized === "auto"
	) {
		return "standard";
	}
	if (normalized === "priority" || normalized === "fast") return "priority";
	if (normalized === "flex") return "flex";
	return null;
}

function parseValues(value: unknown): ChatServiceTier[] {
	if (!Array.isArray(value)) return [];
	const parsed = new Set<ChatServiceTier>();
	for (const entry of value) {
		const candidate = isRecord(entry)
			? entry.value ?? entry.id ?? entry.name ?? entry.tier
			: entry;
		const tier = parseServiceTier(candidate);
		if (tier) parsed.add(tier);
	}
	return SERVICE_TIER_ORDER.filter((tier) => parsed.has(tier));
}

function hasPositiveTierNote(notes: string, tier: "priority" | "flex") {
	const escapedTier = tier === "priority" ? "priority|fast" : "flex";
	const negativePattern = new RegExp(
		`(?:not|no|without|unavailable|unsupported).{0,32}\\b(?:${escapedTier})\\b|\\b(?:${escapedTier})\\b.{0,32}(?:not available|not supported|unavailable|unsupported)`,
		"i",
	);
	if (negativePattern.test(notes)) return false;
	return new RegExp(
		`(?:available|support(?:ed)?|offer(?:ed)?|processing|tier).{0,48}\\b(?:${escapedTier})\\b|\\b(?:${escapedTier})\\b.{0,48}(?:available|support(?:ed)?|offer(?:ed)?|processing|tier)`,
		"i",
	).test(notes);
}

function supportFromConfig(value: unknown): ServiceTierSupport | null {
	if (typeof value === "string") {
		const tier = parseServiceTier(value);
		return tier ? { supportedValues: [tier] } : { supportedValues: ["standard"] };
	}
	if (Array.isArray(value)) {
		const supportedValues = parseValues(value);
		return supportedValues.length > 0 ? { supportedValues } : null;
	}
	if (!isRecord(value)) return null;

	const supportedValues = parseValues(
		value.supported_values ??
			value.supportedValues ??
			value.values ??
			value.enum,
	);
	const defaultValue = parseServiceTier(
		value.default_value ??
			value.default ??
			value.provider_default ??
			value.providerDefault,
	);
	if (supportedValues.length > 0) {
		return {
			supportedValues,
			...(defaultValue && supportedValues.includes(defaultValue)
				? { defaultValue }
				: {}),
		};
	}

	const supported = new Set<ChatServiceTier>(["standard"]);
	const notes = typeof value.notes === "string" ? value.notes : "";
	if (hasPositiveTierNote(notes, "priority")) supported.add("priority");
	if (hasPositiveTierNote(notes, "flex")) supported.add("flex");
	return {
		supportedValues: SERVICE_TIER_ORDER.filter((tier) => supported.has(tier)),
		...(defaultValue && supported.has(defaultValue) ? { defaultValue } : {}),
	};
}

function intersectSupports(
	supports: ServiceTierSupport[],
): ServiceTierSupport | null {
	if (supports.length === 0) return null;
	const common = new Set(supports[0]?.supportedValues ?? []);
	for (const support of supports.slice(1)) {
		const values = new Set(support.supportedValues);
		for (const tier of common) {
			if (!values.has(tier)) common.delete(tier);
		}
	}
	const supportedValues = SERVICE_TIER_ORDER.filter((tier) => common.has(tier));
	const defaults = supports.map((support) => support.defaultValue);
	const defaultValue =
		defaults.length > 0 &&
		defaults.every((tier) => tier && tier === defaults[0]) &&
		supportedValues.includes(defaults[0] as ChatServiceTier)
			? (defaults[0] as ChatServiceTier)
			: undefined;
	return {
		supportedValues,
		...(defaultValue ? { defaultValue } : {}),
	};
}

function isServiceTierParameter(value: unknown) {
	return (
		typeof value === "string" &&
		SERVICE_TIER_PARAMETER_IDS.has(normalizeParameterId(value))
	);
}

function isServiceTierConfig(value: unknown) {
	if (!isRecord(value)) return false;
	return SERVICE_TIER_PARAMETER_IDS.has(
		normalizeParameterId(value.param_id ?? value.paramId ?? value.name ?? value.id),
	);
}

/** Reads service-tier support from either current or legacy route params. */
export function getRouteServiceTierSupport(
	capabilityParams: unknown,
): ServiceTierSupport | null {
	if (Array.isArray(capabilityParams)) {
		const candidates = capabilityParams.filter(
			(entry) => isServiceTierParameter(entry) || isServiceTierConfig(entry),
		);
		if (candidates.length === 0) return null;
		const supports = candidates
			.map((entry) =>
				isServiceTierConfig(entry)
					? supportFromConfig(entry)
					: { supportedValues: ["standard"] as ChatServiceTier[] },
			)
			.filter((support): support is ServiceTierSupport => Boolean(support));
		return intersectSupports(supports);
	}

	if (!isRecord(capabilityParams)) return null;
	const directCandidates = [
		capabilityParams.service_tier,
		capabilityParams.serviceTier,
		capabilityParams["service.tier"],
	].filter((candidate) => candidate !== undefined);
	if (directCandidates.length > 0) {
		const supports = directCandidates
			.map(supportFromConfig)
			.filter((support): support is ServiceTierSupport => Boolean(support));
		return intersectSupports(supports);
	}
	if (isServiceTierConfig(capabilityParams)) return supportFromConfig(capabilityParams);
	return null;
}

function hasTextGenerationCapability(model: GatewaySupportedModel) {
	return (model.capabilities ?? []).some((capabilityId) =>
		TEXT_GENERATION_CAPABILITY_IDS.has(capabilityId.trim().toLowerCase()),
	);
}

function getModelRouteServiceTierSupport(
	model: GatewaySupportedModel,
): ServiceTierSupport | null {
	const capabilityParamsById = model.capabilityParamsById;
	if (isRecord(capabilityParamsById)) {
		const textRoutes = Object.entries(capabilityParamsById).filter(([capabilityId]) =>
			TEXT_GENERATION_CAPABILITY_IDS.has(capabilityId.trim().toLowerCase()),
		);
		if (textRoutes.length > 0) {
			const supports = textRoutes.map(([, params]) =>
				getRouteServiceTierSupport(params) ?? {
					supportedValues: ["standard"] as ChatServiceTier[],
				},
			);
			return intersectSupports(supports);
		}
	}
	return hasTextGenerationCapability(model)
		? { supportedValues: ["standard"] }
		: null;
}

export function getModelServiceTierSupport(args: {
	models: GatewaySupportedModel[];
	modelId: string;
	providerId?: string | null;
	requestModelId?: string | null;
}): ServiceTierSupport | null {
	const providerId = args.providerId?.trim();
	const requestModelId = args.requestModelId?.trim();
	const routeSupports = args.models
		.filter((model) => {
			const matchesModel =
				model.selectorModelId === args.modelId ||
				model.internalModelId === args.modelId ||
				model.modelId === args.modelId;
			if (!matchesModel || !model.isAvailable || model.chatBlockedReasons?.length) {
				return false;
			}
			if (providerId && providerId !== "auto" && model.providerId !== providerId) {
				return false;
			}
			return !requestModelId || model.modelId === requestModelId;
		})
		.map(getModelRouteServiceTierSupport)
		.filter((support): support is ServiceTierSupport => Boolean(support));
	return intersectSupports(routeSupports);
}

export function getServiceTierOptions(
	support: ServiceTierSupport | null | undefined,
): ServiceTierOption[] {
	if (!support || support.supportedValues.length === 0) {
		return SERVICE_TIER_OPTIONS.filter((option) => option.value === "standard");
	}
	const supported = new Set(support.supportedValues);
	return SERVICE_TIER_OPTIONS.filter((option) => supported.has(option.value));
}

export function resolveChatServiceTier(
	tier: ChatServiceTier | null | undefined,
	support: ServiceTierSupport | null | undefined,
): ChatServiceTier {
	const requested = parseServiceTier(tier) ?? "standard";
	if (!support || support.supportedValues.length === 0) return "standard";
	if (support.supportedValues.includes(requested)) return requested;
	if (support.defaultValue && support.supportedValues.includes(support.defaultValue)) {
		return support.defaultValue;
	}
	return support.supportedValues.includes("standard")
		? "standard"
		: support.supportedValues[0] ?? "standard";
}

export function getServiceTierLabel(tier: ChatServiceTier | null | undefined) {
	return (
		SERVICE_TIER_OPTIONS.find((option) => option.value === tier)?.label ??
		"Standard"
	);
}

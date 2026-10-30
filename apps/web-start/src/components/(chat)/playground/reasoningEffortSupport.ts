import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { ChatReasoningEffort } from "@/lib/indexeddb/chats";

export type ReasoningEffortSupport = {
	supportedValues: ChatReasoningEffort[];
	defaultValue?: ChatReasoningEffort;
};

export function filterReasoningEffortOptions<T extends { value: ChatReasoningEffort }>(
	options: T[],
	support: ReasoningEffortSupport | null | undefined,
): T[] {
	// Do not assume `instant` is available when capability metadata is missing;
	// models that explicitly advertise it can still opt in.
	if (!support?.supportedValues.length) {
		return options.filter((option) => option.value !== "instant");
	}
	const supported = new Set(support.supportedValues);
	return options.filter((option) => supported.has(option.value));
}

const REASONING_EFFORT_ORDER: ChatReasoningEffort[] = [
	"none",
	"instant",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

const REASONING_EFFORTS = new Set<string>(REASONING_EFFORT_ORDER);
const TEXT_GENERATION_CAPABILITY_IDS = new Set([
	"text.generate",
	"responses",
	"chat.completions",
	"text.completions",
	"completions",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEffort(value: unknown): ChatReasoningEffort | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	return REASONING_EFFORTS.has(normalized)
		? (normalized as ChatReasoningEffort)
		: null;
}

function parseValues(value: unknown): ChatReasoningEffort[] {
	if (!Array.isArray(value)) return [];
	const parsed = new Set<ChatReasoningEffort>();
	for (const entry of value) {
		const effort = parseEffort(entry);
		if (effort) parsed.add(effort);
	}
	return REASONING_EFFORT_ORDER.filter((effort) => parsed.has(effort));
}

function supportFromConfig(value: unknown): ReasoningEffortSupport | null {
	if (!isRecord(value)) return null;
	const supportedValues = parseValues(
		value.supported_values ?? value.values ?? value.enum,
	);
	if (supportedValues.length === 0) return null;
	const defaultValue = parseEffort(
		value.default_value ?? value.default ?? value.provider_default,
	);
	return {
		supportedValues,
		...(defaultValue && supportedValues.includes(defaultValue)
			? { defaultValue }
			: {}),
	};
}

function intersectSupports(
	supports: ReasoningEffortSupport[],
): ReasoningEffortSupport | null {
	if (supports.length === 0) return null;
	const common = new Set(supports[0]?.supportedValues ?? []);
	for (const support of supports.slice(1)) {
		const values = new Set(support.supportedValues);
		for (const effort of common) {
			if (!values.has(effort)) common.delete(effort);
		}
	}
	const supportedValues = REASONING_EFFORT_ORDER.filter((effort) =>
		common.has(effort),
	);
	const defaults = supports.map((support) => support.defaultValue);
	const defaultValue =
		defaults.length > 0 &&
		defaults.every((effort) => effort && effort === defaults[0]) &&
		supportedValues.includes(defaults[0] as ChatReasoningEffort)
			? (defaults[0] as ChatReasoningEffort)
			: undefined;
	return {
		supportedValues,
		...(defaultValue ? { defaultValue } : {}),
	};
}

/** Reads explicit effort support from either current or legacy route params. */
export function getRouteReasoningEffortSupport(
	capabilityParams: unknown,
): ReasoningEffortSupport | null {
	if (Array.isArray(capabilityParams)) {
		const enumParams = capabilityParams.filter((entry) => {
			if (!isRecord(entry)) return false;
			const parameterId = String(entry.param_id ?? entry.name ?? "")
				.trim()
				.toLowerCase();
			return ["reasoning", "reasoning_effort", "reasoning.effort"].includes(
				parameterId,
			);
		});
		const effortParams = enumParams.filter((entry) => {
			const parameterId = String(entry.param_id ?? entry.name ?? "")
				.trim()
				.toLowerCase();
			return parameterId === "reasoning_effort" || parameterId === "reasoning.effort";
		});
		const parsedEffortParams = effortParams
			.map(supportFromConfig)
			.filter((support): support is ReasoningEffortSupport => Boolean(support));
		const parsedParams = enumParams
			.map(supportFromConfig)
			.filter((support): support is ReasoningEffortSupport => Boolean(support));
		return intersectSupports(
			parsedEffortParams.length > 0 ? parsedEffortParams : parsedParams,
		);
	}

	if (!isRecord(capabilityParams)) return null;
	const reasoning = isRecord(capabilityParams.reasoning)
		? capabilityParams.reasoning
		: null;
	const candidates = [
		capabilityParams["reasoning.effort"],
		capabilityParams.reasoning_effort,
		reasoning?.effort,
		reasoning,
	].filter(isRecord);
	return intersectSupports(
		candidates
			.map(supportFromConfig)
			.filter((support): support is ReasoningEffortSupport => Boolean(support)),
	);
}

function getModelRouteSupport(model: GatewaySupportedModel) {
	const capabilityParamsById = model.capabilityParamsById;
	if (!isRecord(capabilityParamsById)) return null;
	const supports = Object.entries(capabilityParamsById)
		.filter(([capabilityId]) =>
			TEXT_GENERATION_CAPABILITY_IDS.has(capabilityId.trim().toLowerCase()),
		)
		.map(([, params]) => getRouteReasoningEffortSupport(params))
		.filter((support): support is ReasoningEffortSupport => Boolean(support));
	return intersectSupports(supports);
}

export function getModelReasoningEffortSupport(args: {
	models: GatewaySupportedModel[];
	modelId: string;
	providerId?: string | null;
	requestModelId?: string | null;
}): ReasoningEffortSupport | null {
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
		.map(getModelRouteSupport)
		.filter((support): support is ReasoningEffortSupport => Boolean(support));
	return intersectSupports(routeSupports);
}

export function combineReasoningEffortSupports(
	supports: Array<ReasoningEffortSupport | null | undefined>,
): ReasoningEffortSupport | null {
	return intersectSupports(
		supports.filter(
			(support): support is ReasoningEffortSupport => Boolean(support),
		),
	);
}

export function resolveChatReasoningEffort(
	effort: ChatReasoningEffort,
	support: ReasoningEffortSupport | null | undefined,
): ChatReasoningEffort {
	if (!support || support.supportedValues.length === 0) {
		return effort === "instant" ? "medium" : effort;
	}
	if (support.supportedValues.includes(effort)) return effort;
	if (support.defaultValue) return support.defaultValue;
	if (support.supportedValues.includes("medium")) return "medium";
	return support.supportedValues[0] ?? effort;
}

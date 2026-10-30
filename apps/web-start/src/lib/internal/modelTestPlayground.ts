export type PlaygroundEndpoint = "responses" | "chat_completions" | "messages";
export type PlaygroundTransport = "direct" | "typescript_sdk";

export type ParameterProbe = {
	id: string;
	key: string;
	label: string;
	value: unknown;
	expect: "accept" | "reject";
};

export type PlaygroundRun = {
	id: string;
	providerId: string;
	probe: ParameterProbe | null;
};

export const PARAMETER_PROBES: ParameterProbe[] = [
	{ id: "temperature-valid", key: "temperature", label: "Temperature · valid", value: 0.2, expect: "accept" },
	{ id: "temperature-min", key: "temperature", label: "Temperature · minimum", value: 0, expect: "accept" },
	{ id: "temperature-below", key: "temperature", label: "Temperature · below minimum", value: -0.01, expect: "reject" },
	{ id: "temperature-max", key: "temperature", label: "Temperature · maximum", value: 2, expect: "accept" },
	{ id: "temperature-above", key: "temperature", label: "Temperature · above maximum", value: 2.01, expect: "reject" },
	{ id: "top-p-valid", key: "top_p", label: "Top P · valid", value: 0.8, expect: "accept" },
	{ id: "top-p-below", key: "top_p", label: "Top P · below minimum", value: -0.01, expect: "reject" },
	{ id: "top-p-above", key: "top_p", label: "Top P · above maximum", value: 1.01, expect: "reject" },
	{ id: "max-output-valid", key: "max_output_tokens", label: "Max output tokens", value: 48, expect: "accept" },
	{ id: "presence-penalty", key: "presence_penalty", label: "Presence penalty", value: 0.2, expect: "accept" },
	{ id: "frequency-penalty", key: "frequency_penalty", label: "Frequency penalty", value: 0.2, expect: "accept" },
	{ id: "seed", key: "seed", label: "Seed", value: 42, expect: "accept" },
	{ id: "reasoning-low", key: "reasoning", label: "Reasoning effort", value: { effort: "low" }, expect: "accept" },
];

export function buildPlaygroundRuns(
	providerIds: string[],
	probes: ParameterProbe[],
	includeBaseline: boolean,
	iterations = 1,
): PlaygroundRun[] {
	return providerIds.flatMap((providerId) =>
		Array.from({ length: Math.max(1, iterations) }, (_, index) => [
			...(includeBaseline
				? [{ id: `${providerId}:baseline:${index + 1}`, providerId, probe: null }]
				: []),
			...probes.map((probe) => ({
				id: `${providerId}:${probe.id}:${index + 1}`,
				providerId,
				probe,
			})),
		]).flat(),
	);
}

export function buildPlaygroundRequest(args: {
	endpoint: PlaygroundEndpoint;
	model: string;
	prompt: string;
	providerId: string;
	probe: ParameterProbe | null;
	customParameters: Record<string, unknown>;
}): Record<string, unknown> {
	const common: Record<string, unknown> = {
		...args.customParameters,
		model: args.model,
		stream: false,
		provider: { only: [args.providerId], allow_fallbacks: false },
		...(args.probe ? { [args.probe.key]: args.probe.value } : {}),
	};
	if (args.endpoint === "responses") {
		return { ...common, input: args.prompt };
	}
	if (args.endpoint === "messages") {
		const { provider, max_output_tokens: maxOutputTokens, ...messageCommon } = common;
		return {
			...messageCommon,
			max_tokens: maxOutputTokens ?? 48,
			messages: [{ role: "user", content: args.prompt }],
			provider,
		};
	}
	if ("max_output_tokens" in common) {
		common.max_completion_tokens = common.max_output_tokens;
		delete common.max_output_tokens;
	}
	return { ...common, messages: [{ role: "user", content: args.prompt }] };
}

export function isExpectedParameterRejection(status: number): boolean {
	return status === 400 || status === 422;
}

export function summarizeErrorPayload(payload: unknown, fallback: string) {
	if (!payload || typeof payload !== "object") return fallback;
	const source = payload as Record<string, unknown>;
	const nested = source.error && typeof source.error === "object"
		? source.error as Record<string, unknown>
		: null;
	for (const value of [nested?.message, source.message, source.detail, source.error]) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return fallback;
}

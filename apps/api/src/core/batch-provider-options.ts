// Batch extensions are intentionally explicit: options must not replace owned
// input files, priced rows, models, endpoints, or customer webhook destinations.
const allowedOptions: Record<string, readonly string[]> = {
	openai: ["output_expires_after"],
	mistral: ["metadata"],
};

export function selectBatchProviderOptions(value: unknown, providerId: string): Record<string, unknown> {
	if (value === undefined) return {};
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("provider_options must be an object");
	for (const [provider, options] of Object.entries(value)) {
		if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Each provider_options entry must be an object");
		if (Object.keys(options).some((key) => !allowedOptions[provider]?.includes(key))) throw new Error(`Unsupported batch provider option for ${provider}`);
	}
	return { ...((value as Record<string, Record<string, unknown>>)[providerId] ?? {}) };
}

// Purpose: Normalize provider text usage payloads for pricing.
// Why: Providers return different token key names; pricing expects stable meters.
// How: Coerces common usage field variants into canonical meter keys.

function pickNumber(source: any, path: string): number | undefined {
	if (!source || typeof source !== "object") return undefined;
	const parts = path.split(".");
	let current: any = source;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = current[part];
	}
	return typeof current === "number" ? current : undefined;
}

function pickFirstNumber(source: any, paths: string[]): number | undefined {
	for (const path of paths) {
		const value = pickNumber(source, path);
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return undefined;
}

export function normalizeTextUsageForPricing(usageRaw: any): Record<string, number> | undefined {
	if (!usageRaw || typeof usageRaw !== "object") return undefined;

	const inputTokens = pickFirstNumber(usageRaw, [
		"input_tokens",
		"prompt_tokens",
		"inputTokens",
		"promptTokenCount",
	]);
	const outputTokens = pickFirstNumber(usageRaw, [
		"output_tokens",
		"completion_tokens",
		"outputTokens",
		"candidatesTokenCount",
	]);
	const totalTokens = pickFirstNumber(usageRaw, [
		"total_tokens",
		"totalTokens",
		"totalTokenCount",
	]) ?? ((inputTokens ?? 0) + (outputTokens ?? 0));

	const cachedReadTokens = pickFirstNumber(usageRaw, [
		"cached_read_text_tokens",
		"cachedInputTokens",
		"cachedContentTokenCount",
		"input_tokens_details.cached_tokens",
		"prompt_tokens_details.cached_tokens",
	]);
	const cachedWriteTokens = pickFirstNumber(usageRaw, [
		"cached_write_text_tokens",
		"_ext.cachedWriteTokens",
		"output_tokens_details.cached_tokens",
		"completion_tokens_details.cached_tokens",
	]);
	const reasoningTokens = pickFirstNumber(usageRaw, [
		"reasoning_tokens",
		"reasoningTokens",
		"thoughtsTokenCount",
		"thoughtTokenCount",
		"output_tokens_details.reasoning_tokens",
		"completion_tokens_details.reasoning_tokens",
	]);

	const inputImageTokens = pickFirstNumber(usageRaw, [
		"input_image_tokens",
		"_ext.inputImageTokens",
		"input_tokens_details.input_images",
	]);
	const inputAudioTokens = pickFirstNumber(usageRaw, [
		"input_audio_tokens",
		"_ext.inputAudioTokens",
		"input_tokens_details.input_audio",
	]);
	const inputVideoTokens = pickFirstNumber(usageRaw, [
		"input_video_tokens",
		"_ext.inputVideoTokens",
		"input_tokens_details.input_videos",
	]);
	const outputImageTokens = pickFirstNumber(usageRaw, [
		"output_image_tokens",
		"_ext.outputImageTokens",
		"output_tokens_details.output_images",
	]);
	const outputAudioTokens = pickFirstNumber(usageRaw, [
		"output_audio_tokens",
		"_ext.outputAudioTokens",
		"output_tokens_details.output_audio",
	]);
	const outputVideoTokens = pickFirstNumber(usageRaw, [
		"output_video_tokens",
		"_ext.outputVideoTokens",
		"output_tokens_details.output_videos",
	]);

	const meters: Record<string, number> = {
		input_tokens: inputTokens ?? 0,
		input_text_tokens: inputTokens ?? 0,
		output_tokens: outputTokens ?? 0,
		output_text_tokens: outputTokens ?? 0,
		total_tokens: totalTokens ?? 0,
	};

	if (typeof cachedReadTokens === "number") meters.cached_read_text_tokens = cachedReadTokens;
	if (typeof cachedWriteTokens === "number") meters.cached_write_text_tokens = cachedWriteTokens;
	if (typeof reasoningTokens === "number") meters.reasoning_tokens = reasoningTokens;
	if (typeof inputImageTokens === "number") meters.input_image_tokens = inputImageTokens;
	if (typeof inputAudioTokens === "number") meters.input_audio_tokens = inputAudioTokens;
	if (typeof inputVideoTokens === "number") meters.input_video_tokens = inputVideoTokens;
	if (typeof outputImageTokens === "number") meters.output_image_tokens = outputImageTokens;
	if (typeof outputAudioTokens === "number") meters.output_audio_tokens = outputAudioTokens;
	if (typeof outputVideoTokens === "number") meters.output_video_tokens = outputVideoTokens;

	return meters;
}

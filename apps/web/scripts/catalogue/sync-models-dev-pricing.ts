import type { JsonObject } from "./catalogue-sync-shared";

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || !value.trim()) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export function modelDevMeters(cost: JsonObject): Record<string, number> | null {
	if (cost.tiers) return null;
	const meters = Object.fromEntries([
		["input_text_tokens", asNumber(cost.input)],
		["cached_read_text_tokens", asNumber(cost.cache_read)],
		["cached_write_text_tokens", asNumber(cost.cache_write)],
		["output_text_tokens", asNumber(cost.output)],
		["input_audio_tokens", asNumber(cost.input_audio)],
		["output_audio_tokens", asNumber(cost.output_audio)],
		["output_reasoning_tokens", asNumber(cost.reasoning)],
	].filter((entry): entry is [string, number] => entry[1] !== null));
	return Object.keys(meters).length > 0 ? meters : null;
}

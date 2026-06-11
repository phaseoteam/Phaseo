const TOKEN_METER_ORDER = [
	"input_tokens",
	"output_tokens",
	"total_tokens",
] as const;

const TOKEN_METER_SET = new Set<string>(TOKEN_METER_ORDER);

const IGNORED_USAGE_KEYS = new Set<string>([
	"pricing",
	"pricing_breakdown",
	"input_tokens_details",
	"output_tokens_details",
]);

const LABEL_OVERRIDES: Record<string, { long: string; short: string }> = {
	input_tokens: { long: "Input tokens", short: "in tokens" },
	output_tokens: { long: "Output tokens", short: "out tokens" },
	total_tokens: { long: "Total tokens", short: "total tokens" },
	cache_read_tokens: { long: "Cache read tokens", short: "cache read" },
	cache_write_tokens: { long: "Cache write tokens", short: "cache write" },
	reasoning_tokens: { long: "Reasoning tokens", short: "reasoning" },
	input_images: { long: "Input images", short: "in images" },
	input_audio: { long: "Input audio", short: "in audio" },
	input_videos: { long: "Input videos", short: "in video" },
	output_images: { long: "Output images", short: "out images" },
	output_audio: { long: "Output audio", short: "out audio" },
	output_videos: { long: "Output videos", short: "out video" },
	requests: { long: "Requests", short: "req" },
	input_characters: { long: "Input characters", short: "in chars" },
	output_image: { long: "Images", short: "images" },
	image_pixels: { long: "Image pixels", short: "img px" },
	video_pixels: { long: "Video pixels", short: "vid px" },
	output_video_seconds: { long: "Video seconds", short: "video sec" },
	output_video_tokens: { long: "Video tokens", short: "video tok" },
	output_audio_seconds: { long: "Audio seconds", short: "audio sec" },
	output_reasoning_tokens: { long: "Output reasoning tokens", short: "reasoning out" },
	output_video: { long: "Output videos", short: "out video" },
	bfl_credits: { long: "BFL credits", short: "bfl credits" },
	datetime_requests: { long: "Datetime tool requests", short: "datetime" },
	web_search_requests: { long: "Web search requests", short: "web search" },
	web_search_results: { long: "Web search results", short: "search results" },
	web_search_extra_results: { long: "Web search extra results", short: "extra results" },
	web_fetch_requests: { long: "Web fetch requests", short: "web fetch" },
	advisor_requests: { long: "Advisor requests", short: "advisor" },
	image_generation_requests: { long: "Image generation requests", short: "image generation" },
	apply_patch_requests: { long: "Apply patch requests", short: "apply patch" },
	requested_native_web_search_tools: {
		long: "Requested native web search tools",
		short: "search tools",
	},
	output_web_search_result_count: {
		long: "Web search results",
		short: "search results",
	},
	output_citation_count: { long: "Citations", short: "citations" },
};

export type UsageMeter = {
	key: string;
	value: number;
	label: string;
	shortLabel: string;
};

export type UsageDisplaySummary = {
	primary: string;
	tooltipLines: string[];
	sortValue: number;
};

function toNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function canonicalKey(raw: string): string {
	const key = raw.trim().toLowerCase();
	if (key === "input_text_tokens") return "input_tokens";
	if (key === "prompt_tokens") return "input_tokens";
	if (key === "output_text_tokens") return "output_tokens";
	if (key === "completion_tokens") return "output_tokens";
	if (key === "cached_read_text_tokens") return "cache_read_tokens";
	if (key === "cached_write_text_tokens") return "cache_write_tokens";
	return key;
}

function formatLabel(key: string, short = false): string {
	const override = LABEL_OVERRIDES[key];
	if (override) return short ? override.short : override.long;
	const spaced = key.replace(/_/g, " ").trim();
	if (!spaced) return key;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatUsageNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	const rounded = Math.round(value * 1000) / 1000;
	const isInt = Math.abs(rounded - Math.trunc(rounded)) < 1e-9;
	if (isInt) return Math.trunc(rounded).toLocaleString();
	return rounded
		.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })
		.replace(/\.0+$/, "");
}

export function extractUsageMeters(usage: any): UsageMeter[] {
	const totals = new Map<string, number>();
	const pricingKeys = new Set<string>();

	const add = (key: string, value: number, mode: "sum" | "set") => {
		if (!Number.isFinite(value) || value <= 0) return;
		const existing = totals.get(key) ?? 0;
		totals.set(key, mode === "sum" ? existing + value : value);
	};

	const pricingLines = Array.isArray(usage?.pricing_breakdown?.lines)
		? usage.pricing_breakdown.lines
		: Array.isArray(usage?.pricing?.lines)
			? usage.pricing.lines
			: [];

	for (const line of pricingLines) {
		const rawKey = typeof line?.dimension === "string" ? line.dimension : "";
		const key = canonicalKey(rawKey);
		if (!key) continue;
		const value = toNumber(line?.quantity ?? line?.billable_units);
		if (value == null) continue;
		add(key, value, "sum");
		pricingKeys.add(key);
	}

	if (usage && typeof usage === "object" && !Array.isArray(usage)) {
		for (const [rawKey, rawValue] of Object.entries(usage)) {
			const key = canonicalKey(rawKey);
			if (!key || IGNORED_USAGE_KEYS.has(key) || pricingKeys.has(key)) continue;
			const value = toNumber(rawValue);
			if (value == null) continue;
			add(key, value, "set");
		}
	}

	const inputDetails = usage?.input_tokens_details ?? usage?.input_details ?? {};
	const outputDetails = usage?.output_tokens_details ?? usage?.completion_tokens_details ?? {};
	const serverToolUse = usage?.server_tool_use ?? usage?.serverToolUse ?? {};
	const detailMeters: Array<[string, unknown]> = [
		["cache_read_tokens", inputDetails?.cached_tokens],
		["cache_write_tokens", outputDetails?.cached_tokens],
		["reasoning_tokens", outputDetails?.reasoning_tokens ?? usage?.reasoning_tokens],
		["input_images", inputDetails?.input_images],
		["input_audio", inputDetails?.input_audio],
		["input_videos", inputDetails?.input_videos],
		["output_images", outputDetails?.output_images],
		["output_audio", outputDetails?.output_audio],
		["output_videos", outputDetails?.output_videos],
		["datetime_requests", serverToolUse?.datetime_requests],
		["web_search_requests", serverToolUse?.web_search_requests],
		["web_search_results", serverToolUse?.web_search_results],
		["web_search_extra_results", serverToolUse?.web_search_extra_results],
		["web_fetch_requests", serverToolUse?.web_fetch_requests],
		["advisor_requests", serverToolUse?.advisor_requests],
		["image_generation_requests", serverToolUse?.image_generation_requests],
		["apply_patch_requests", serverToolUse?.apply_patch_requests],
	];
	for (const [key, rawValue] of detailMeters) {
		const value = toNumber(rawValue);
		if (value == null || pricingKeys.has(key)) continue;
		add(key, value, "set");
	}

	const input = toNumber(usage?.input_tokens ?? usage?.input_text_tokens) ?? 0;
	const output = toNumber(usage?.output_tokens ?? usage?.output_text_tokens) ?? 0;
	const total = toNumber(usage?.total_tokens) ?? input + output;
	if (!totals.has("input_tokens") && input > 0) totals.set("input_tokens", input);
	if (!totals.has("output_tokens") && output > 0) totals.set("output_tokens", output);
	if (!totals.has("total_tokens") && total > 0) totals.set("total_tokens", total);

	const tokenMeters: UsageMeter[] = TOKEN_METER_ORDER.map((key) => {
		const value = totals.get(key) ?? 0;
		return {
			key,
			value,
			label: formatLabel(key, false),
			shortLabel: formatLabel(key, true),
		};
	}).filter((meter) => meter.value > 0);

	const extraMeters: UsageMeter[] = [];
	for (const [key, value] of totals.entries()) {
		if (TOKEN_METER_SET.has(key) || value <= 0) continue;
		extraMeters.push({
			key,
			value,
			label: formatLabel(key, false),
			shortLabel: formatLabel(key, true),
		});
	}
	extraMeters.sort((a, b) => a.label.localeCompare(b.label));

	return [...tokenMeters, ...extraMeters];
}

export function buildUsageDisplay(usage: any): UsageDisplaySummary {
	const meters = extractUsageMeters(usage);
	const input = meters.find((m) => m.key === "input_tokens")?.value ?? 0;
	const output = meters.find((m) => m.key === "output_tokens")?.value ?? 0;
	const total = meters.find((m) => m.key === "total_tokens")?.value ?? input + output;
	const nonToken = meters.filter((m) => !TOKEN_METER_SET.has(m.key));

	if (input > 0 || output > 0) {
		const tooltipLines = [
			`${formatUsageNumber(input)} input tokens`,
			`${formatUsageNumber(output)} output tokens`,
			`${formatUsageNumber(total)} total tokens`,
			...nonToken.map((m) => `${formatUsageNumber(m.value)} ${m.label.toLowerCase()}`),
		];
		return {
			primary: `${formatUsageNumber(input)} | ${formatUsageNumber(output)}`,
			tooltipLines,
			sortValue: total > 0 ? total : input + output,
		};
	}

	if (nonToken.length > 0) {
		const [first, ...rest] = nonToken;
		return {
			primary:
				`${formatUsageNumber(first.value)} ${first.shortLabel}` +
				(rest.length > 0 ? ` +${rest.length}` : ""),
			tooltipLines: nonToken.map((m) => `${formatUsageNumber(m.value)} ${m.label.toLowerCase()}`),
			sortValue: nonToken.reduce((sum, meter) => sum + meter.value, 0),
		};
	}

	return {
		primary: "-",
		tooltipLines: ["No usage meters"],
		sortValue: 0,
	};
}


const TOKEN_METER_ORDER = [
	"input_text_tokens",
	"output_text_tokens",
	"total_tokens",
] as const;

const TOKEN_METER_SET = new Set<string>(TOKEN_METER_ORDER);

const IGNORED_USAGE_KEYS = new Set<string>([
	"pricing",
	"pricing_breakdown",
	"input_tokens",
	"output_tokens",
]);

const LABEL_OVERRIDES: Record<string, { long: string; short: string }> = {
	input_text_tokens: { long: "Input tokens", short: "in tokens" },
	output_text_tokens: { long: "Output tokens", short: "out tokens" },
	total_tokens: { long: "Total tokens", short: "total tokens" },
	requests: { long: "Requests", short: "req" },
	output_image: { long: "Images", short: "images" },
	output_video_seconds: { long: "Video seconds", short: "video sec" },
	output_audio_seconds: { long: "Audio seconds", short: "audio sec" },
	bfl_credits: { long: "BFL credits", short: "bfl credits" },
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
	if (key === "input_tokens") return "input_text_tokens";
	if (key === "output_tokens") return "output_text_tokens";
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

	const input = toNumber(usage?.input_text_tokens ?? usage?.input_tokens) ?? 0;
	const output = toNumber(usage?.output_text_tokens ?? usage?.output_tokens) ?? 0;
	const total = toNumber(usage?.total_tokens) ?? input + output;
	if (!totals.has("input_text_tokens") && input > 0) totals.set("input_text_tokens", input);
	if (!totals.has("output_text_tokens") && output > 0) totals.set("output_text_tokens", output);
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
	const input = meters.find((m) => m.key === "input_text_tokens")?.value ?? 0;
	const output = meters.find((m) => m.key === "output_text_tokens")?.value ?? 0;
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


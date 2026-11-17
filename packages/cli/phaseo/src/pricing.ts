import { renderTable, sanitizeTerminalText, type TableOptions } from "./output.js";
import { modelPageUrl, providerPageUrl } from "./links.js";

export type PricingCondition = { op?: string; path?: string; value?: unknown; or_group?: number; and_index?: number };
export type PricingTimeWindow = { label?: string; start_time?: string; end_time?: string; timezone?: string; days_of_week?: string[]; price_per_unit?: string | number | null };
export type PricingMeter = {
	meter: string;
	unit?: string;
	unit_size?: number;
	price_per_unit: string | number;
	currency?: string;
	conditions?: PricingCondition[];
	time_windows?: PricingTimeWindow[];
};
export type PricingRoute = {
	provider: string;
	model: string;
	endpoint: string;
	/** Provider service tier (standard, flex, priority, ...). Older API responses omit it. */
	service_tier?: string | null;
	display_name?: string | null;
	meters?: PricingMeter[];
};

export type PricingFilters = { model?: string; provider?: string; endpoint?: string; tier?: string; preferExactModel?: boolean };

const INPUT_METERS = ["input_text_tokens", "input_tokens"];
const OUTPUT_METERS = ["output_text_tokens", "output_tokens"];
const CACHE_READ_METERS = ["cached_read_text_tokens", "implicit_cached_input_text_tokens"];

const METER_LABELS: Record<string, string> = {
	native_web_search_requests: "Web search",
	output_reasoning_tokens: "Reasoning output",
	implicit_cached_input_text_tokens: "Cache read text (implicit)",
	requests: "Request",
};

function formatAmount(value: number): string {
	if (value === 0) return "$0";
	const abs = Math.abs(value);
	const digits = abs >= 0.01
		? { minimumFractionDigits: 2, maximumFractionDigits: 4 }
		: { minimumSignificantDigits: 1, maximumSignificantDigits: 3 };
	return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...digits }).format(value);
}

/** "$0.10" style price for a meter's per-unit price string. */
export function formatPrice(price: string | number | undefined, currency = "USD"): string {
	const value = Number(price);
	if (!Number.isFinite(value)) return String(price ?? "-");
	return currency === "USD" ? formatAmount(value) : `${value} ${currency}`;
}

function formatSize(size: number): string {
	if (size >= 1e9 && size % 1e9 === 0) return `${size / 1e9}B`;
	if (size >= 1e6 && size % 1e6 === 0) return `${size / 1e6}M`;
	if (size >= 1e3 && size % 1e3 === 0) return `${size / 1e3}K`;
	return new Intl.NumberFormat("en-US").format(size);
}

/** "per 1M tokens", "per image", "per 60 seconds". */
export function formatUnit(meter: Pick<PricingMeter, "unit" | "unit_size">): string {
	const unit = meter.unit ?? "unit";
	const size = meter.unit_size ?? 1;
	if (unit === "USD") return "of the provider's charge";
	if (size === 1) return `per ${unit}`;
	return `per ${formatSize(size)} ${unit}s`;
}

/** Short unit for table cells: "/M", "/K", "/image", "/s". Token prices are the common case, so they stay compact. */
function shortUnit(meter: PricingMeter): string {
	const unit = meter.unit ?? "unit";
	const size = meter.unit_size ?? 1;
	if (unit === "token" && size === 1e6) return "/M";
	if (unit === "token" && size === 1e3) return "/K";
	if (unit === "second" && size === 1) return "/s";
	if (unit === "minute" && size === 1) return "/min";
	if (size === 1) return `/${unit}`;
	return `/${formatSize(size)} ${unit}s`;
}

export function meterLabel(meter: string): string {
	if (METER_LABELS[meter]) return METER_LABELS[meter];
	let label = meter
		.replace(/^cached_read_/, "cache read ")
		.replace(/^cached_write_/, "cache write ")
		.replace(/_tokens(_(\w+))?$/, (_match, _suffix, window) => (window ? ` (${window})` : ""))
		.replace(/_/g, " ")
		.trim();
	label = label.replace(/\s+/g, " ");
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function isTiered(entries: PricingMeter[]): boolean {
	return entries.length > 1 || entries.some((entry) => (entry.conditions?.length ?? 0) > 0 || (entry.time_windows?.length ?? 0) > 0);
}

function lowestPrice(entries: PricingMeter[]): number {
	const prices = entries.flatMap((entry) => [Number(entry.price_per_unit), ...(entry.time_windows ?? []).filter((window) => window.price_per_unit !== null && window.price_per_unit !== undefined && window.price_per_unit !== "").map((window) => Number(window.price_per_unit))]);
	return Math.min(...prices.filter((price) => Number.isFinite(price)));
}

function groupMeters(route: PricingRoute): Map<string, PricingMeter[]> {
	const groups = new Map<string, PricingMeter[]>();
	for (const meter of route.meters ?? []) {
		const list = groups.get(meter.meter) ?? [];
		list.push(meter);
		groups.set(meter.meter, list);
	}
	return groups;
}

/** Table cell for the first meter in `names` that the route has: "$0.10/M", or "from $0.05/M" when it is tiered. */
function priceCell(groups: Map<string, PricingMeter[]>, names: string[]): string {
	for (const name of names) {
		const entries = groups.get(name);
		if (!entries?.length) continue;
		const text = `${formatPrice(lowestPrice(entries), entries[0].currency)}${shortUnit(entries[0])}`;
		return isTiered(entries) ? `from ${text}` : text;
	}
	return "-";
}

/** A meter priced per USD of provider cost passes the provider's own charge through. */
function isPassThrough(entries: PricingMeter[]): boolean {
	return entries[0]?.unit === "USD";
}

function otherPart(name: string, entries: PricingMeter[]): string {
	if (isPassThrough(entries)) return `Provider cost ×${Number(entries[0].price_per_unit)}`;
	const text = `${meterLabel(name)} ${formatPrice(lowestPrice(entries), entries[0].currency)}${shortUnit(entries[0])}`;
	return isTiered(entries) ? `${meterLabel(name)} from ${text.slice(meterLabel(name).length + 1)}` : text;
}

function otherCell(groups: Map<string, PricingMeter[]>): string {
	const shown = new Set([...INPUT_METERS, ...OUTPUT_METERS, ...CACHE_READ_METERS]);
	const rest = [...groups.entries()].filter(([name]) => !shown.has(name));
	if (!rest.length) return "-";
	// Routes with no token prices (images, audio, search) show their own meters here.
	const [first] = rest;
	const firstText = otherPart(first[0], first[1]);
	return rest.length === 1 ? firstText : `${firstText}, +${rest.length - 1} more`;
}

function matches(value: string | null | undefined, filter: string | undefined): boolean {
	if (!filter) return true;
	return String(value ?? "").toLowerCase().includes(filter.toLowerCase());
}

export function filterPricingRoutes(routes: PricingRoute[], filters: PricingFilters): PricingRoute[] {
	const matched = routes.filter((route) =>
		(matches(route.model, filters.model) || matches(route.display_name, filters.model))
		&& matches(route.provider, filters.provider)
		&& matches(route.endpoint, filters.endpoint)
		&& matches(route.service_tier ?? "standard", filters.tier));
	if (!filters.preferExactModel || !filters.model) return matched;
	// "gpt-6-luna" should not also list gpt-6-luna-pro when the exact model exists.
	const wanted = filters.model.toLowerCase();
	const exact = matched.filter((route) => route.model.toLowerCase() === wanted || route.model.toLowerCase().endsWith(`/${wanted}`));
	return exact.length ? exact : matched;
}

function hasTiers(routes: PricingRoute[]): boolean {
	return routes.some((route) => route.service_tier && route.service_tier !== "standard");
}

export function renderPricingTable(routes: PricingRoute[], options: TableOptions = {}): string {
	const rows = routes.map((route) => ({ route, groups: groupMeters(route) }));
	return renderTable(rows, [
		{ header: "MODEL", value: ({ route }) => route.model, shrink: true, link: ({ route }) => modelPageUrl(route.model) },
		{ header: "PROVIDER", value: ({ route }) => route.provider, shrink: true, link: ({ route }) => providerPageUrl(route.provider) },
		{ header: "ENDPOINT", value: ({ route }) => route.endpoint },
		...(hasTiers(routes) ? [{ header: "TIER", value: ({ route }: { route: PricingRoute }) => route.service_tier ?? "standard" }] : []),
		{ header: "INPUT", value: ({ groups }) => priceCell(groups, INPUT_METERS), align: "right" },
		{ header: "OUTPUT", value: ({ groups }) => priceCell(groups, OUTPUT_METERS), align: "right" },
		{ header: "CACHE READ", value: ({ groups }) => priceCell(groups, CACHE_READ_METERS), align: "right" },
		{ header: "OTHER", value: ({ groups }) => otherCell(groups), shrink: true },
	], options);
}

const OPS: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=", neq: "≠" };

function formatConditionValue(value: unknown): string {
	return typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : String(value);
}

/** "input tokens ≤ 256,000". Conditions in the same or_group are ANDed; groups are ORed. */
export function formatConditions(conditions: PricingCondition[] = []): string {
	if (!conditions.length) return "";
	const groups = new Map<number, PricingCondition[]>();
	for (const condition of conditions) {
		const key = condition.or_group ?? 0;
		groups.set(key, [...(groups.get(key) ?? []), condition]);
	}
	return [...groups.values()]
		.map((group) => group
			.sort((a, b) => (a.and_index ?? 0) - (b.and_index ?? 0))
			.map((condition) => `${String(condition.path ?? "value").replace(/_/g, " ")} ${OPS[condition.op ?? ""] ?? condition.op ?? "?"} ${formatConditionValue(condition.value)}`)
			.join(" and "))
		.join(" or ");
}

function formatWindow(window: PricingTimeWindow, meter: PricingMeter): string {
	const label = window.label ? `${window.label} ` : "";
	const days = window.days_of_week?.length ? `${window.days_of_week.join(", ")} ` : "";
	// A window without its own price keeps the meter price.
	const price = window.price_per_unit === null || window.price_per_unit === undefined || window.price_per_unit === "" ? meter.price_per_unit : window.price_per_unit;
	return `${label}${days}${window.start_time ?? "?"}–${window.end_time ?? "?"} ${window.timezone ?? "UTC"}: ${formatPrice(price, meter.currency)}`;
}

/** Input first, then cache, then output, then everything else. */
function meterRank(meter: string): number {
	if (INPUT_METERS.includes(meter) || meter.startsWith("input_")) return 0;
	if (meter.startsWith("cached_read_") || CACHE_READ_METERS.includes(meter)) return 1;
	if (meter.startsWith("cached_write_")) return 2;
	if (OUTPUT_METERS.includes(meter) || meter.startsWith("output_")) return 3;
	return 4;
}

/** Lower prompt-size tier first: a "≤"/"<" condition sorts before ">"/"≥" on the same path. */
function conditionRank(meter: PricingMeter): number {
	const condition = meter.conditions?.[0];
	if (!condition) return 0;
	const value = typeof condition.value === "number" ? condition.value : 0;
	return condition.op === "gt" || condition.op === "gte" ? value + 0.5 : value;
}

function sortMeters(meters: PricingMeter[]): PricingMeter[] {
	return meters
		.map((meter, index) => ({ meter, index }))
		.sort((a, b) => conditionRank(a.meter) - conditionRank(b.meter)
			|| meterRank(a.meter.meter) - meterRank(b.meter.meter)
			|| a.meter.meter.localeCompare(b.meter.meter)
			|| a.index - b.index)
		.map(({ meter }) => meter);
}

/** Every meter of each route, with tiers and time-of-day prices. */
export function renderPricingDetails(routes: PricingRoute[], options: TableOptions = {}): string {
	if (!routes.length) return "No results.\n";
	return routes.map((route) => {
		const tier = route.service_tier && route.service_tier !== "standard" ? `, ${route.service_tier} tier` : "";
		const title = `${route.display_name ? `${route.display_name} ` : ""}(${route.model}) via ${route.provider}, ${route.endpoint}${tier}`;
		const rows = sortMeters(route.meters ?? []);
		const table = renderTable(rows, [
			{ header: "METER", value: (meter) => meter.unit === "USD" ? "Provider cost" : meterLabel(meter.meter) },
			{ header: "PRICE", value: (meter) => meter.unit === "USD" ? `×${Number(meter.price_per_unit)}` : formatPrice(meter.price_per_unit, meter.currency), align: "right" },
			{ header: "UNIT", value: (meter) => formatUnit(meter) },
			{ header: "APPLIES WHEN", value: (meter) => [formatConditions(meter.conditions), ...(meter.time_windows ?? []).map((window) => formatWindow(window, meter))].filter(Boolean).join("; ") || "always", shrink: true },
		], options);
		return `${sanitizeTerminalText(title)}\n${table}`;
	}).join("\n");
}

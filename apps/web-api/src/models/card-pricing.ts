type Row = Record<string, unknown>;

/**
 * One billable meter, normalised to a comparable unit.
 *
 * `price` is per `unit`: tokens are always per 1M, time is kept in the unit
 * the provider bills (per second, minute, or hour), and other units keep the
 * provider's batch size (per 1K characters, per image, and so on).
 */
type Rate = {
	key: string;
	label: string;
	price: number;
	unit: string;
	tier: string;
	side: "input" | "output" | "";
	modality: string;
	auxiliary: boolean;
};

/**
 * The card's one-line headline price. It carries numbers rather than prose so
 * the web app can localise the wording; `from` means cheaper and dearer rates
 * exist (other providers, sizes, or meters), which the hover card lists.
 */
export type CardPricingSummary =
	| { kind: "free" }
	| { kind: "tokens"; from: boolean; input: number | null; output: number | null; unit: "1M tokens" }
	| { kind: "usage"; from: boolean; price: number; unit: string };

const MEDIA = ["image", "video", "audio"];

const title = (value: unknown) => String(value ?? "")
	.trim()
	.replace(/[_-]+/g, " ")
	.replace(/\s+/g, " ")
	.replace(/\b\w/g, (character) => character.toUpperCase());

function finite(value: unknown): number | null {
	if (value == null || (typeof value === "string" && !value.trim())) return null;
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}

/** 1000 -> "1K", 1_000_000 -> "1M"; other batch sizes stay as written. */
function batchSize(quantity: number): string {
	if (quantity >= 1_000_000_000 && quantity % 1_000_000_000 === 0) return `${quantity / 1_000_000_000}B`;
	if (quantity >= 1_000_000 && quantity % 1_000_000 === 0) return `${quantity / 1_000_000}M`;
	if (quantity >= 1_000 && quantity % 1_000 === 0) return `${quantity / 1_000}K`;
	return quantity.toLocaleString("en-US");
}

const SHORT_UNITS: Record<string, [singular: string, plural: string]> = {
	character: ["character", "characters"],
	second: ["sec", "sec"],
	minute: ["min", "min"],
	hour: ["hr", "hr"],
	image: ["image", "images"],
	video: ["video", "videos"],
	request: ["request", "requests"],
	page: ["page", "pages"],
	frame: ["frame", "frames"],
	message: ["message", "messages"],
	search: ["search", "searches"],
};

function unitName(unit: string, quantity: number): string {
	const singular = unit.replace(/s$/, "");
	const names = SHORT_UNITS[singular];
	if (!names) return quantity === 1 ? singular : `${singular}s`;
	return quantity === 1 ? names[0] : names[1];
}

function parseDisplayUnit(value: string): { quantity: number; unit: string } | null {
	const match = value.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([km](?=\s|$))?\s*([a-z][a-z ]*)$/);
	if (!match) return null;
	const multiplier = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
	return { quantity: Number(match[1]) * multiplier, unit: match[3].trim() };
}

/** Returns the display unit and the factor that turns the meter price into a price per that unit. */
function normaliseUnit(row: Row): { unit: string; factor: number } | null {
	let unit = String(row.unit ?? "").trim().toLowerCase();
	let quantity = finite(row.unit_quantity);
	const rawDisplayUnit = String(row.display_unit ?? "").trim();
	const displayUnit = rawDisplayUnit.toLowerCase() === "billing unit" ? "" : rawDisplayUnit;
	const parsed = displayUnit ? parseDisplayUnit(displayUnit) : null;
	if ((!unit || quantity === null) && parsed) {
		unit = parsed.unit;
		quantity = parsed.quantity;
	}
	const singular = unit.replace(/s$/, "");
	// A provider label that says more than "N units" (for example "1 track
	// (up to 5 minutes)") describes what the charge covers, so it is kept
	// unless the unit is one the card canonicalises (tokens and time).
	if (displayUnit && !parsed && !["token", "second", "minute", "hour"].includes(singular)) {
		return { unit: displayUnit.replace(/^1\s+/, ""), factor: 1 };
	}
	if (!unit) return null;
	quantity ??= 1;
	if (quantity <= 0) return null;
	if (singular === "token") return { unit: "1M tokens", factor: 1_000_000 / quantity };
	if (singular === "second" && quantity === 60) return { unit: "min", factor: 1 };
	if (singular === "second" && quantity === 3600) return { unit: "hr", factor: 1 };
	if (singular === "minute" && quantity === 60) return { unit: "hr", factor: 1 };
	const name = unitName(singular, quantity);
	return { unit: quantity === 1 ? name : `${batchSize(quantity)} ${name}`, factor: 1 };
}

function rate(row: Row): Rate | null {
	const price = finite(row.price);
	if (price === null) return null;
	const unit = normaliseUnit(row);
	if (!unit) return null;
	const key = String(row.meter_key ?? row.label ?? "usage").trim().toLowerCase();
	const direction = String(row.direction ?? "").trim().toLowerCase();
	const side = direction === "input" || key.startsWith("input")
		? "input"
		: direction === "output" || key.startsWith("output")
			? "output"
			: "";
	const modality = String(row.modality ?? "").trim().toLowerCase()
		|| ["text", "image", "video", "audio"].find((value) => key.includes(value))
		|| (unit.unit === "1M tokens" ? "text" : "");
	return {
		key,
		label: title(row.label || row.meter_key || "Usage"),
		price: price * unit.factor,
		unit: unit.unit,
		tier: String(row.service_tier ?? "standard").trim().toLowerCase() || "standard",
		side,
		modality,
		// Cache, batch-discount, and reasoning meters are real prices but never
		// the headline rate a reader compares models by. Neither is a meter that
		// passes the provider's own charge through in dollars.
		auxiliary: /cache|cached|batch|discount|reasoning|storage/.test(key) || isPassThrough(unit.unit),
	};
}

function isPassThrough(unit: string): boolean {
	return /^(?:\d+\s*)?usd$/i.test(unit);
}

/**
 * Formats a USD amount for display. Amounts of a cent or more get cents
 * ("$0.50", "$2.50") with up to three decimals ("$0.035"); integers stay bare
 * ("$15"); sub-cent amounts keep three significant digits so a small rate never
 * looks free.
 */
export function formatUsd(price: number): string {
	if (price === 0) return "$0";
	if (price >= 0.01) {
		const integer = Number.isInteger(price) || Math.abs(price - Math.round(price)) < 1e-9;
		return `$${price.toLocaleString("en-US", {
			minimumFractionDigits: integer ? 0 : 2,
			maximumFractionDigits: integer ? 0 : 3,
		})}`;
	}
	return `$${price.toLocaleString("en-US", { maximumSignificantDigits: 3 })}`;
}

function min(rates: Rate[]): number {
	return Math.min(...rates.map((item) => item.price));
}

function spread(rates: Rate[]): string {
	const low = min(rates);
	const high = Math.max(...rates.map((item) => item.price));
	return low === high ? formatUsd(low) : `${formatUsd(low)}–${formatUsd(high)}`;
}

function varies(rates: Rate[]): boolean {
	return new Set(rates.map((item) => item.price)).size > 1;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>();
	for (const item of items) {
		const identity = key(item);
		grouped.set(identity, [...(grouped.get(identity) ?? []), item]);
	}
	return grouped;
}

const SIDE_ORDER: Record<string, number> = { input: 0, output: 1, "": 2 };

function detailOrder(a: Rate, b: Rate): number {
	return Number(a.tier !== "standard") - Number(b.tier !== "standard")
		|| Number(a.auxiliary) - Number(b.auxiliary)
		|| SIDE_ORDER[a.side] - SIDE_ORDER[b.side]
		|| a.key.localeCompare(b.key)
		|| a.tier.localeCompare(b.tier);
}

// Billing units listed from most to least representative of a media model.
const MEDIA_UNIT_ORDER = ["image", "sec", "min", "hr", "video", "frame"];

function mediaUnitRank(unit: string): number {
	const index = MEDIA_UNIT_ORDER.findIndex((candidate) => unit === candidate || unit.endsWith(` ${candidate}`));
	return index === -1 ? MEDIA_UNIT_ORDER.length : index;
}

const DISCOUNT_TIER = /batch|flex|discount/;

/**
 * Narrows rates to the most representative service tier: standard when
 * present, then other full-price tiers (provider-named tiers, on-demand,
 * priority), and only then discounted tiers such as batch, so a discounted
 * rate is never shown as a list price while a full-price rate exists.
 */
function preferredTier(rates: Rate[]): Rate[] {
	const standard = rates.filter((item) => item.tier === "standard");
	if (standard.length) return standard;
	const fullPrice = rates.filter((item) => !DISCOUNT_TIER.test(item.tier));
	return fullPrice.length ? fullPrice : rates;
}

const isTextToken = (item: Rate) => item.unit === "1M tokens" && item.modality === "text"
	&& (item.side === "input" || item.side === "output");

function summarise(model: Row, rates: Rate[]): CardPricingSummary | null {
	const base = rates.filter((item) => !item.auxiliary);
	const candidates = preferredTier(base);
	if (!candidates.length) return null;

	const outputModalities = model.gateway_output_modalities ?? model.output_types ?? model.output_modalities;
	const outputs = Array.isArray(outputModalities) ? outputModalities.map((item) => String(item).toLowerCase()) : [];
	const isMediaOutput = (item: Rate) => item.side === "output" && MEDIA.includes(item.modality) && item.unit !== "1M tokens";
	const mediaOutputs = preferredTier(base.filter(isMediaOutput));
	const media = mediaOutputs.length > 0 || (outputs.some((item) => /image|video|audio/.test(item)) && !outputs.includes("text"));

	// Token rates are chosen in their own best tier, so a standard-tier tool
	// fee cannot displace input/output pricing offered only in other tiers.
	// Each side picks its tier independently, so a side priced only in a
	// provider tier is not dropped because the other side has a standard rate.
	const textTokens = base.filter(isTextToken);
	const input = preferredTier(textTokens.filter((item) => item.side === "input"));
	const output = preferredTier(textTokens.filter((item) => item.side === "output"));
	const tokens = [...input, ...output];
	if (!media && (input.length || output.length)) {
		// Free is decided by the token rates alone; a paid tool fee does not
		// make a free model's tokens cost "$0".
		if (tokens.every((item) => item.price === 0)) return { kind: "free" };
		return {
			kind: "tokens",
			from: varies(input) || varies(output),
			input: input.length ? min(input) : null,
			output: output.length ? min(output) : null,
			unit: "1M tokens",
		};
	}

	// Media and other usage-priced models: headline the cheapest primary rate
	// in its most representative unit, and leave the rest to the detail rows.
	const primary = mediaOutputs.length
		? mediaOutputs
		: media && candidates.some((item) => item.side === "output")
			? candidates.filter((item) => item.side === "output")
			: candidates;
	// As with tokens, free status comes only from the meters chosen above.
	if (primary.every((item) => item.price === 0)) return { kind: "free" };
	const byUnit = [...groupBy(primary, (item) => item.unit).entries()]
		.sort(([a, aRates], [b, bRates]) => mediaUnitRank(a) - mediaUnitRank(b) || bRates.length - aRates.length || a.localeCompare(b));
	const [unit, unitRates] = byUnit[0];
	// Only alternative headline rates qualify the price; input meters on a
	// media model are in the hover card, not a reason to say "From".
	return {
		kind: "usage",
		from: varies(unitRates) || byUnit.length > 1,
		price: min(unitRates),
		unit,
	};
}

/**
 * Converts V2 meter rows into the models-page card contract: a one-line
 * headline (`pricing_summary`), every meter for the hover card
 * (`pricing_detail_rows`), and headline-only `lowest_*` prices that exclude
 * cache, batch, and other discounted meters.
 */
export function normalizeModelsPagePricing(model: Row): Row {
	const rows = Array.isArray(model.pricing_detail_rows)
		? model.pricing_detail_rows.filter((item): item is Row => Boolean(item) && typeof item === "object")
		: [];
	if (!rows.length) return model;
	const rates = rows.map(rate).filter((item): item is Rate => item !== null);
	const preformatted = rows
		.filter((item) => finite(item.price) === null && item.label && item.value)
		.map((item) => ({ label: String(item.label), value: String(item.value) }));
	if (!rates.length) return { ...model, pricing_detail_rows: preformatted };

	const detailRows = [...groupBy(rates, (item) => `${item.key}|${item.unit}|${item.tier}`).values()]
		.sort((a, b) => detailOrder(a[0], b[0]))
		.map((items) => ({
			label: items[0].tier === "standard" ? items[0].label : `${items[0].label} (${title(items[0].tier)})`,
			value: isPassThrough(items[0].unit) && items.every((item) => item.price === 1)
				? "At provider cost"
				: `${spread(items)} / ${items[0].unit}`,
		}));

	// The compatibility fields (price sort, older consumers) use the same tier
	// preference as the headline, so tier-only models keep a sortable price.
	const summary = summarise(model, rates);
	const headline = rates.filter((item) => !item.auxiliary);
	const lowest = (side: Rate["side"]) => {
		const matches = headline.filter((item) => item.side === side);
		// A usage headline fixes the unit: the sort then compares the rate the
		// card shows, not a cheaper-looking rate in another unit.
		if (summary?.kind === "usage") {
			const sameUnit = preferredTier(matches.filter((item) => item.unit === summary.unit));
			return sameUnit.length ? { price: min(sameUnit), unit: summary.unit } : null;
		}
		// Prefer the text token meters the headline uses, so a zero-priced
		// image or audio token meter cannot become the sortable input price.
		const textTokens = matches.filter(isTextToken);
		const tokenMatches = matches.filter((item) => item.unit === "1M tokens");
		const pool = preferredTier(textTokens.length ? textTokens : tokenMatches.length ? tokenMatches : matches);
		return pool.length && pool.every((item) => item.unit === pool[0].unit)
			? { price: min(pool), unit: pool[0].unit }
			: null;
	};
	const input = lowest("input");
	const output = lowest("output");
	const from = [input, output].filter((item) => item !== null)
		.sort((a, b) => a.price - b.price)[0] ?? null;

	// Text-and-Decisions models already carry per-operation prices, and their
	// `lowest_*` fields hold the text-generation rates; the detail rows mix
	// both operations' SKUs, so they must not overwrite those prices. Those
	// prices are per 1M tokens, which replaces the RPC's "billing unit".
	if (Array.isArray(model.operation_pricing)) {
		const tokenUnit = (price: unknown) => (finite(price) === null ? null : "1M tokens");
		return {
			...model,
			pricing_summary: summary,
			pricing_detail_rows: [...detailRows, ...preformatted],
			lowest_standard_input_price_label: "Input",
			lowest_standard_output_price_label: "Output",
			lowest_standard_input_price_unit: tokenUnit(model.lowest_standard_input_price),
			lowest_standard_output_price_unit: tokenUnit(model.lowest_standard_output_price),
			lowest_from_price_unit: tokenUnit(model.lowest_from_price),
		};
	}

	return {
		...model,
		pricing_summary: summary,
		pricing_detail_rows: [...detailRows, ...preformatted],
		lowest_input_price: input?.price ?? null,
		lowest_output_price: output?.price ?? null,
		lowest_standard_input_price: input?.price ?? null,
		lowest_standard_output_price: output?.price ?? null,
		lowest_standard_input_price_label: "Input",
		lowest_standard_output_price_label: "Output",
		lowest_standard_input_price_unit: input?.unit ?? null,
		lowest_standard_output_price_unit: output?.unit ?? null,
		lowest_from_price: from?.price ?? null,
		lowest_from_price_unit: from?.unit ?? null,
	};
}

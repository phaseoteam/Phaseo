/**
 * Turns the models-grid price card's `{ label, value }` rows into short,
 * merged rows. Labels come from the pricing meter alone: a modality is named
 * only when the meter names one (text is the default and is never named), and
 * the model's listed modalities are never consulted. Meters of the same kind
 * and price that differ only by a named modality become one row.
 */

export type PriceRowKind =
	| "input"
	| "output"
	| "reasoning"
	| "cachedInput"
	| "cachedWrite"
	| "requests"
	| "webSearch"
	| "webFetch"
	| "tokens";

export type PriceModality = "image" | "video" | "audio";

export const TOKEN_UNIT = "1M tokens";

export type ParsedPriceValue = {
	from: boolean;
	/** The amount exactly as the API formatted it, such as "$0.10". */
	amount: string;
	unit: string | null;
};

export type ParsedPriceMeter = {
	kind: PriceRowKind | null;
	/** Null for text and for meters that name no modality. */
	modality: PriceModality | null;
	/** Cache window, such as "1h" or "5m". */
	window: string | null;
	/** What a conditional price applies to, such as "720p with audio". */
	variant: string | null;
	/** Shown when the meter is not one of the known kinds. */
	fallbackLabel: string;
};

export type PriceCardRow = {
	key: string;
	kind: PriceRowKind | null;
	fallbackLabel: string;
	/** Named non-text modalities this row covers, in display order. */
	modalities: PriceModality[];
	/** Whether the row also covers text or a meter that names no modality. */
	coversDefault: boolean;
	window: string | null;
	variant: string | null;
	price: ParsedPriceValue | null;
	/** The API's value when it is not a plain price, such as "At provider cost". */
	rawValue: string;
};

const MODALITY_ORDER: PriceModality[] = ["image", "video", "audio"];

const toKey = (value: string) =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

const WINDOW_PATTERN = /(?:^|_)(\d+)_?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)(?:_ttl)?(?:_|$)/;

function cacheWindow(key: string): string | null {
	const match = key.match(WINDOW_PATTERN);
	if (!match) return null;
	return `${Number(match[1])}${match[2].startsWith("h") ? "h" : "m"}`;
}

// Words a meter may contain and still get a short label. A meter with any other
// word ("Embedding Input", "Server Tool Input") is a distinct billable meter, so it
// keeps its own name rather than reading as plain "Input".
const KNOWN_WORDS = new Set([
	"input", "output", "prompt", "completion", "text", "token", "tokens",
	"image", "images", "video", "videos", "audio",
	"cache", "cached", "read", "reads", "hit", "hits", "write", "writes", "creation",
	"reasoning", "thinking", "ttl",
	"web", "search", "searches", "fetch", "fetches", "request", "requests", "total",
	// Billing-source words that don't change what the meter charges for.
	"implicit", "native", "server", "tool",
]);
const WINDOW_WORD = /^\d+(?:m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$|^(?:m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/;

function onlyKnownWords(words: Set<string>): boolean {
	for (const word of words) if (word && !KNOWN_WORDS.has(word) && !WINDOW_WORD.test(word)) return false;
	return true;
}

function meterKind(words: Set<string>, key: string): PriceRowKind | null {
	if (!onlyKnownWords(words)) return null;
	if (words.has("reasoning")) return "reasoning";
	const cache = words.has("cache") || words.has("cached");
	if (cache && (words.has("write") || words.has("creation"))) return "cachedWrite";
	if (cache) return "cachedInput";
	if (/(?:^|_)web_search(?:_|$)/.test(key)) return "webSearch";
	if (/(?:^|_)web_fetch(?:_|$)/.test(key)) return "webFetch";
	if (key === "requests" || key === "request") return "requests";
	if (key === "total_tokens") return "tokens";
	if (words.has("input")) return "input";
	if (words.has("output")) return "output";
	return null;
}

function meterModality(words: Set<string>): PriceModality | null {
	if (words.has("image") || words.has("images")) return "image";
	if (words.has("video") || words.has("videos")) return "video";
	if (words.has("audio")) return "audio";
	return null;
}

/** "Server Tool Image Pixels" -> "Server tool image pixels"; acronyms keep their case. */
function sentenceCase(value: string): string {
	return value
		.trim()
		.split(/\s+/)
		.map((word, index) => (index > 0 && /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
		.join(" ");
}

/** Reads a meter label such as "Cached Read Text Tokens" or "Output Video (720p)". */
export function parsePriceMeterLabel(label: string): ParsedPriceMeter {
	const trimmed = label.trim();
	const parenthetical = trimmed.match(/^(.*?)\s*\(([^()]+)\)$/);
	const base = parenthetical ? parenthetical[1] : trimmed;
	const note = parenthetical ? parenthetical[2].trim() : null;
	// "(5 Min TTL)" and "(1 Hour TTL)" are cache windows, not price variants.
	const noteWindow = note ? cacheWindow(toKey(note)) : null;
	const key = toKey(base);
	const words = new Set(key.split("_"));
	const kind = meterKind(words, key);
	const isCache = kind === "cachedInput" || kind === "cachedWrite";
	return {
		kind,
		// Only the meter's own words name a modality; text is the default.
		modality: kind ? meterModality(words) : null,
		window: isCache ? noteWindow ?? cacheWindow(key) : null,
		variant: note && !noteWindow ? note : null,
		fallbackLabel: sentenceCase(trimmed),
	};
}

function normaliseUnit(unit: string): string {
	const trimmed = unit.trim().replace(/\s+/g, " ");
	if (/^(?:1\s*)?m tokens?$/i.test(trimmed) || /^1m tokens?$/i.test(trimmed)) return TOKEN_UNIT;
	return trimmed;
}

/** Reads "$2 / 1M tokens", "From $0.04 / image" or "$2 /M tokens". */
export function parsePriceValue(value: string): ParsedPriceValue | null {
	const match = value.trim().match(/^(from\s+)?(\$\d[\d,]*(?:\.\d+)?)(?:\s*(?:\/|per)\s*(.+))?$/i);
	if (!match) return null;
	return {
		from: Boolean(match[1]),
		amount: match[2],
		unit: match[3] ? normaliseUnit(match[3]) : null,
	};
}

/** Parses, then merges same-kind, same-price rows that differ only by a named modality. */
export function buildPriceCardRows(
	rows: ReadonlyArray<{ id: string; label: string; value: string }>,
): PriceCardRow[] {
	const result: PriceCardRow[] = [];
	const groups = new Map<string, PriceCardRow>();
	for (const row of rows) {
		const meter = parsePriceMeterLabel(row.label);
		const price = parsePriceValue(row.value);
		const mergeKey = meter.kind && price
			? [meter.kind, meter.window ?? "", meter.variant ?? "", price.from ? "from" : "", price.amount, price.unit ?? ""].join("|")
			: null;
		const existing = mergeKey ? groups.get(mergeKey) : undefined;
		if (existing) {
			if (meter.modality) {
				if (!existing.modalities.includes(meter.modality)) existing.modalities.push(meter.modality);
			} else {
				existing.coversDefault = true;
			}
			continue;
		}
		const next: PriceCardRow = {
			key: row.id,
			kind: meter.kind,
			fallbackLabel: meter.fallbackLabel,
			modalities: meter.modality ? [meter.modality] : [],
			coversDefault: !meter.modality,
			window: meter.window,
			variant: meter.variant,
			price,
			rawValue: row.value,
		};
		if (mergeKey) groups.set(mergeKey, next);
		result.push(next);
	}
	for (const row of result) {
		row.modalities.sort((a, b) => MODALITY_ORDER.indexOf(a) - MODALITY_ORDER.indexOf(b));
	}
	return result;
}

/** How the card states units: all per 1M tokens, some, or none. */
export function priceCardTokenUnits(rows: ReadonlyArray<PriceCardRow>): "all" | "some" | "none" {
	const priced = rows.filter((row) => row.price?.unit);
	const tokenRows = priced.filter((row) => row.price?.unit === TOKEN_UNIT);
	if (tokenRows.length === 0) return "none";
	return tokenRows.length === priced.length ? "all" : "some";
}

export type PriceCardLabels = {
	kinds: Record<PriceRowKind, string>;
	modalities: Record<PriceModality, string>;
	/** Joins names as a list, such as "image, video and audio". */
	list: (items: string[]) => string;
	/** "Also image, video and audio". */
	also: (list: string) => string;
	from: string;
	atProviderCost: string;
};

export type DescribedPriceCardRow = {
	key: string;
	label: string;
	note: string | null;
	value: string;
};

/** The words a row shows. Token prices drop their unit; the meta line states it once. */
export function describePriceCardRow(row: PriceCardRow, labels: PriceCardLabels): DescribedPriceCardRow {
	const modalityNames = row.modalities.map((modality) => labels.modalities[modality]);
	let label = row.fallbackLabel;
	let also: string | null = null;
	if (row.kind) {
		const parts = [labels.kinds[row.kind]];
		if (row.window) parts.push(row.window);
		if (modalityNames.length > 0) {
			// Text is never named: a row that also covers text lists the others underneath.
			if (row.coversDefault) also = labels.also(labels.list(modalityNames));
			else parts.push(labels.list(modalityNames));
		}
		label = parts.join(" · ");
	}
	const note = [also, row.variant].filter(Boolean).join(" · ") || null;
	let value = row.rawValue;
	if (row.price) {
		const unit = row.price.unit && row.price.unit !== TOKEN_UNIT ? ` / ${row.price.unit}` : "";
		value = `${row.price.from ? `${labels.from} ` : ""}${row.price.amount}${unit}`;
	} else if (row.rawValue.trim().toLowerCase() === "at provider cost") {
		value = labels.atProviderCost;
	}
	return { key: row.key, label, note, value };
}

/**
 * A US-dollar amount for the card headline: "$2", "$12.50", "$0.0375".
 * Sub-cent amounts keep their significant digits and are cut, never rounded up.
 */
export function formatCardUsd(value: number): string {
	if (value === 0) return "$0";
	const integer = Math.abs(value - Math.round(value)) < 1e-9;
	const options: Intl.NumberFormatOptions & { roundingMode?: "trunc" } = value < 0.01
		? { maximumSignificantDigits: 6, roundingMode: "trunc" }
		: {
				minimumFractionDigits: integer ? 0 : 2,
				maximumFractionDigits: integer ? 0 : 4,
				roundingMode: "trunc",
			};
	return `$${value.toLocaleString("en-US", options)}`;
}

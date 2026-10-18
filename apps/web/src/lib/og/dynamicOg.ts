import {
	RegExpMatcher,
	englishDataset,
	englishRecommendedTransformers,
} from "obscenity";

// Anyone can put text on a Phaseo-branded image through /og/dynamic, so the
// inputs are checked strictly: a fixed set of params, short lengths, Latin
// text only (the font has no other glyphs and the word filter is English), no
// links or email addresses, and no profanity or slurs.

export const DYNAMIC_OG_LIMITS = {
	title: 90,
	description: 180,
	pathname: 80,
} as const;

type DynamicOgField = keyof typeof DYNAMIC_OG_LIMITS;

const ALLOWED_PARAMS = new Set<string>(Object.keys(DYNAMIC_OG_LIMITS));

export type DynamicOgParams = {
	title: string;
	description?: string;
	pathname?: string;
};

export type DynamicOgRejection =
	| "missing_title"
	| "unknown_param"
	| "duplicate_param"
	| "too_long"
	| "invalid_characters"
	| "invalid_pathname"
	| "contains_link"
	| "blocked_text";

export type DynamicOgParseResult =
	| { ok: true; value: DynamicOgParams }
	| { ok: false; reason: DynamicOgRejection; field?: string };

// Latin letters and marks, digits, spaces and everyday punctuation. Excludes
// angle brackets, braces, backticks, control, zero-width and bidi characters.
const TEXT_PATTERN = /^[\p{Script=Latin}\p{M}\p{N} .,:;!?'"’‘“”()&+\-–—/%$€£#*_|·…]+$/u;
const PATHNAME_PATTERN = /^\/[A-Za-z0-9\-._~/]*$/;

// Domains are only blocked for TLDs people actually click, so names such as
// "Next.js" or "GPT-4.5" stay allowed.
const LINK_PATTERNS = [
	/https?:/i,
	/:\/\//,
	/\bwww\./i,
	/[\w.+-]+@[\w-]+\.[\w.-]+/,
	/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\s*\.\s*(?:com|net|org|io|ai|app|co|xyz|ru|cn|info|biz|me|gg|ly|link|click|top|site|online|dev|tk|ml|ga|cf|gq|sh|to|cc|tv|us|uk|de|fr|in|live|shop|store|vip|win|bit|pw|su|zip|mov)\b/i,
];
const ALLOWED_DOMAINS = /\b(?:docs\.)?phaseo\.app\b/gi;

const profanityMatcher = new RegExpMatcher({
	...englishDataset.build(),
	...englishRecommendedTransformers,
});

function normalise(value: string): string {
	return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function containsLink(value: string): boolean {
	const withoutOwnDomains = value.replace(ALLOWED_DOMAINS, "");
	return LINK_PATTERNS.some((pattern) => pattern.test(withoutOwnDomains));
}

// Three or more single letters split by separators, e.g. "f u c k" or "f.u.c.k".
const SPELLED_OUT_PATTERN =
	/(?<![\p{L}\p{N}])\p{L}(?=[\s.\-_*·|]+\p{L}(?![\p{L}\p{N}]))(?:[\s.\-_*·|]+\p{L}(?![\p{L}\p{N}])){2,}/gu;

export function containsBlockedText(value: string): boolean {
	// Join spelled-out letters so spacing a word apart does not get it through,
	// without joining whole words ("cocktail analysis" must stay allowed).
	const joined = value.replace(SPELLED_OUT_PATTERN, (match) => match.replace(/[^\p{L}]+/gu, ""));
	return profanityMatcher.hasMatch(value) || profanityMatcher.hasMatch(joined);
}

export function parseDynamicOgParams(searchParams: URLSearchParams): DynamicOgParseResult {
	const seen = new Set<string>();
	for (const key of searchParams.keys()) {
		if (!ALLOWED_PARAMS.has(key)) return { ok: false, reason: "unknown_param", field: key };
		if (seen.has(key)) return { ok: false, reason: "duplicate_param", field: key };
		seen.add(key);
	}

	const values: Partial<Record<DynamicOgField, string>> = {};
	for (const field of Object.keys(DYNAMIC_OG_LIMITS) as DynamicOgField[]) {
		const raw = searchParams.get(field);
		if (raw === null) continue;
		const value = normalise(raw);
		if (!value) continue;
		if (value.length > DYNAMIC_OG_LIMITS[field]) return { ok: false, reason: "too_long", field };
		if (field === "pathname") {
			if (!PATHNAME_PATTERN.test(value) || value.includes("//") || value.includes("..")) {
				return { ok: false, reason: "invalid_pathname", field };
			}
		} else {
			if (containsLink(value)) return { ok: false, reason: "contains_link", field };
			if (!TEXT_PATTERN.test(value)) return { ok: false, reason: "invalid_characters", field };
		}
		const checked = field === "pathname" ? value.replace(/[/\-._~]+/g, " ") : value;
		if (containsBlockedText(checked)) return { ok: false, reason: "blocked_text", field };
		values[field] = value;
	}

	if (!values.title) return { ok: false, reason: "missing_title", field: "title" };
	return {
		ok: true,
		value: {
			title: values.title,
			...(values.description ? { description: values.description } : {}),
			...(values.pathname ? { pathname: values.pathname } : {}),
		},
	};
}

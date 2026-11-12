import { decodeModelIdFromUrl, encodeModelIdForUrl } from "./compareUrl";

const SEPARATOR = "-vs-";

/** Sorted so a comparison has one URL whichever model was picked first. */
export function sortPair(ids: [string, string]): [string, string] {
	return ids[0] < ids[1] ? [ids[0], ids[1]] : [ids[1], ids[0]];
}

/** `/compare/anthropic_claude-opus-5.5-vs-openai_gpt-6-astra` for two model ids. */
export function pairPath(ids: [string, string]): string {
	return `/compare/${sortPair(ids).map(encodeModelIdForUrl).join(SEPARATOR)}`;
}

/** The two model ids a pair slug names, in the order written, or null when the slug isn't a pair. */
export function parsePairSlug(slug: string): [string, string] | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(slug);
	} catch {
		return null;
	}
	const parts = decoded.split(SEPARATOR);
	if (parts.length !== 2) return null;
	const [first, second] = parts.map(decodeModelIdFromUrl);
	if (!first || !second || first === second || !first.includes("/") || !second.includes("/")) return null;
	return [first, second];
}

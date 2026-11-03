/**
 * sqlcommenter-style query tags for PlanetScale Query Insights.
 *
 * Placement: PlanetScale only reads a tag comment that sits inside the
 * statement, and its docs and every example append it at the END of the
 * statement (before any semicolon). August 2026's leading comments were moved
 * to the end in 2c9854dcd2 ("Fix PlanetScale query tag placement") for this
 * reason, so tags are appended, never prepended.
 *
 * Encoding: keys are sorted, values are URL-encoded and single-quoted, as the
 * sqlcommenter spec and PlanetScale's docs describe. After decoding,
 * PlanetScale only accepts `[\w\-./:,]+` (keys <= 65 bytes, values <= 1024
 * bytes), so other characters are replaced with `_` before encoding and
 * values are truncated. `'` and `*` are always percent-encoded, so a value can
 * never close the quote or the comment.
 */
export type QueryTags = Record<string, string | number | boolean | null | undefined>;

const ALLOWED = /[^\w\-./:,]/g;

function clean(value: string, maxBytes: number): string {
	let out = value.replace(ALLOWED, "_");
	if (out.length > maxBytes) out = out.slice(0, maxBytes);
	return out;
}

function encode(value: string): string {
	return encodeURIComponent(value).replace(/'/g, "%27").replace(/\*/g, "%2A").replace(/!/g, "%21").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** `/*app='gateway',route='%2Fv1%2Fchat',table='keys'*\/`, or "" when there are no tags. */
export function formatQueryTag(tags: QueryTags): string {
	const parts: string[] = [];
	for (const key of Object.keys(tags).sort()) {
		const raw = tags[key];
		if (raw === undefined || raw === null || raw === "") continue;
		const k = clean(key, 65);
		const v = clean(String(raw), 1024);
		if (!k || !v) continue;
		parts.push(`${encode(k)}='${encode(v)}'`);
	}
	return parts.length ? `/*${parts.join(",")}*/` : "";
}

/** Append the tag comment to a statement (before a trailing semicolon, if any). */
export function tagStatement(statement: string, tags: QueryTags): string {
	const comment = formatQueryTag(tags);
	if (!comment) return statement;
	const trimmed = statement.replace(/\s+$/, "");
	if (trimmed.endsWith(";")) return `${trimmed.slice(0, -1)} ${comment};`;
	return `${trimmed} ${comment}`;
}

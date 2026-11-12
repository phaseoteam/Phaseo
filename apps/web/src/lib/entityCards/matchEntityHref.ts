// Recognises catalogue entity links by their href, so every existing link to a
// model, provider, organisation, app, benchmark, family, collection or country
// page opens an entity card without any change at the link.
//
// Only an entity's own page counts: `/models/acme/rocket` is the model, but
// `/models/acme/rocket/pricing`, `/api-providers/acme/models` and
// `/countries/gb/models` are sub-pages or tabs inside an entity page. Those are
// navigation within a page the reader is already on (or about to open), so they
// never open a card. Listing pages (`/models`, `/api-providers/compare`, ...)
// are not entities either.
import { isPublicLocale } from "@/i18n/locales";

export const ENTITY_KINDS = ["model", "provider", "organisation", "app", "benchmark", "family", "collection", "country"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
export type EntityTarget = { kind: EntityKind; id: string };

/** Second segments under these sections that are pages of their own, not entity ids. */
const RESERVED_MODEL_SEGMENTS = new Set(["table", "collections"]);
const RESERVED_PROVIDER_SEGMENTS = new Set(["compare", "table"]);

function decode(segment: string): string | null {
	try {
		return decodeURIComponent(segment);
	} catch {
		return null;
	}
}

/** The path of a same-origin href, or null for external, protocol and fragment-only links. */
function pathOf(href: string, origin?: string): string | null {
	const value = href.trim();
	if (!value || value.startsWith("#") || value.startsWith("//")) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
		if (!origin) return null;
		try {
			const url = new URL(value);
			return url.origin === origin ? url.pathname : null;
		} catch {
			return null;
		}
	}
	if (!value.startsWith("/")) return null;
	return value.split(/[?#]/)[0] ?? null;
}

/**
 * The entity an href points at, or null when it is not an entity page.
 * Accepts root-relative hrefs with or without a public locale prefix, and
 * absolute URLs on `origin` (pass `window.location.origin` in the browser).
 */
export function matchEntityHref(href: string | null | undefined, origin?: string): EntityTarget | null {
	if (!href) return null;
	const path = pathOf(href, origin);
	if (!path) return null;
	const raw = path.split("/").filter(Boolean);
	const segments = isPublicLocale(raw[0]) ? raw.slice(1) : raw;
	const decoded = segments.map(decode);
	if (decoded.some((segment) => !segment)) return null;
	const [section, first, second, third, ...rest] = decoded as string[];
	if (!section || !first) return null;

	switch (section) {
		case "models":
			// /models/collections/<id>
			if (first === "collections") return second && !third ? { kind: "collection", id: second } : null;
			// /models/<organisation>/<model>
			if (RESERVED_MODEL_SEGMENTS.has(first) || !second || third) return null;
			return { kind: "model", id: `${first}/${second}` };
		case "api-providers":
			return !second && !RESERVED_PROVIDER_SEGMENTS.has(first) ? { kind: "provider", id: first } : null;
		case "organisations":
			return second ? null : { kind: "organisation", id: first };
		case "apps":
			return second ? null : { kind: "app", id: first };
		case "benchmarks":
			return second ? null : { kind: "benchmark", id: first };
		case "families":
			// Family ids can contain slashes (`/families/openai/gpt-5`), so every segment is the id.
			return { kind: "family", id: [first, second, third, ...rest].filter(Boolean).join("/") };
		case "countries":
			return !second && /^[a-z]{2}$/i.test(first) ? { kind: "country", id: first.toUpperCase() } : null;
		default:
			return null;
	}
}

export function sameEntity(left: EntityTarget | null, right: EntityTarget | null): boolean {
	return Boolean(left && right && left.kind === right.kind && left.id === right.id);
}

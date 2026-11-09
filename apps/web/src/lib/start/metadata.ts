// Page metadata across the server-function boundary: route params and search
// go in as plain strings, and the result comes back as plain JSON.
import { defaultLocale } from "@/i18n/locales";

/** Metadata after a JSON round trip: what a server function can return. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type SerializableMetadata = { [key: string]: JsonValue };

/** What a page's `get<Name>Metadata` receives. */
export type RouteMetadataInput = { params: Record<string, string>; search: Record<string, string | string[]> };

/**
 * Route params and search as plain strings. The optional locale segment is
 * filled with the default locale, so metadata builders always see one.
 */
export function routeMetadataInput(params: Record<string, unknown>, search: unknown = {}): RouteMetadataInput {
	const outParams: Record<string, string> = {};
	for (const [key, value] of Object.entries(params)) if (typeof value === "string") outParams[key] = value;
	outParams.locale = outParams.locale || defaultLocale;
	const outSearch: Record<string, string | string[]> = {};
	for (const [key, value] of Object.entries((search ?? {}) as Record<string, unknown>)) {
		if (Array.isArray(value)) outSearch[key] = value.map(String);
		else if (value !== undefined && value !== null) outSearch[key] = String(value);
	}
	return { params: outParams, search: outSearch };
}

/** Metadata holds URL objects (metadataBase, images); send plain JSON across the server-function boundary. */
export function toSerializableMetadata(metadata: unknown): SerializableMetadata | null {
	if (!metadata) return null;
	return JSON.parse(JSON.stringify(metadata)) as SerializableMetadata;
}

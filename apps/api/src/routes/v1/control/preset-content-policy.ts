import { resolveResponseCachePolicy } from "@/core/response-cache";
import { presetConfigSchema } from "@/pipeline/before/schemas";
import { WEB_FETCH_PLUGIN_ID, WEB_SEARCH_PLUGIN_ID } from "@/plugins/server-tool-plugins";

/** What a preset lets the requests that use it store or send beyond the model provider, as the gateway reads it. */
export type PresetContentPolicy = {
	/** How long responses are kept in the response cache; 0 when the preset turns caching off. */
	cacheTtlSeconds: number;
	/** The preset requires zero data retention, which also keeps responses out of the cache. */
	zeroDataRetention: boolean;
	/** The `web` plugin, which sends search queries to a search engine. */
	webSearch: boolean;
	/** The `web-fetch` plugin, which fetches URLs the model chooses. */
	webFetch: boolean;
};

/**
 * The effective content policy of a preset config, parsed by the same schema and cache policy the gateway
 * uses, so both spellings of each field and the defaults count exactly as they do on requests. Null when
 * the config doesn't parse.
 */
export function presetContentPolicy(config: unknown): PresetContentPolicy | null {
	const parsed = presetConfigSchema.safeParse(config ?? {});
	if (!parsed.success) return null;
	const { responseCaching, provider, plugins } = parsed.data;
	const cache = resolveResponseCachePolicy({
		presetTtlSeconds: responseCaching?.ttlSeconds ?? null,
		presetDisabled: responseCaching?.enabled === false,
	});
	const enabledPlugins = new Set((plugins ?? []).filter((plugin) => plugin.enabled !== false).map((plugin) => plugin.id));
	return {
		cacheTtlSeconds: cache.enabled ? cache.ttlSeconds ?? 0 : 0,
		zeroDataRetention: provider?.requireZeroDataRetention === true,
		webSearch: enabledPlugins.has(WEB_SEARCH_PLUGIN_ID),
		webFetch: enabledPlugins.has(WEB_FETCH_PLUGIN_ID),
	};
}

/** A request that uses no preset: the gateway's defaults. */
const NO_PRESET = presetContentPolicy({}) as PresetContentPolicy;

/**
 * Whether going from `before` to `after` lets requests store more content, keep it longer or send it to more
 * places: a longer (or newly default) cache, dropping zero data retention, or turning on web search or fetch.
 * `before` is null for a new preset, which is compared with using no preset. A config the gateway can't read
 * counts as widening, so it can't slip past the check.
 */
export function widensPresetContentPolicy(before: unknown | null, after: unknown): boolean {
	const next = presetContentPolicy(after);
	if (!next) return true;
	const previous = (before === null ? null : presetContentPolicy(before)) ?? NO_PRESET;
	return next.cacheTtlSeconds > previous.cacheTtlSeconds
		|| (previous.zeroDataRetention && !next.zeroDataRetention)
		|| (next.webSearch && !previous.webSearch)
		|| (next.webFetch && !previous.webFetch);
}

export const PRESET_CONTENT_APP_REFUSAL = "Apps that use Sign in with Phaseo can't make a preset cache responses for longer, drop zero data retention, or turn on web search or fetch, because these change what request content is kept and where it goes. The person can change the preset under Settings, Presets.";

// Purpose: Keep OpenAI's 12-hour prompt-cache lifetime off routes that cannot take it.
// Why: Only OpenAI's own Responses API documents "12h" (GPT-5.6 and later); Azure OpenAI
//      and other routes document "30m" or nothing, and a route with no 12-hour price row
//      could not bill the writes at their published rate.
// How: Routing ranks routes that take 12h first. On any other route the lifetime is
//      removed, so the route's 30-minute default applies, and the removal is reported
//      through the dropped-params record (X-Phaseo-Dropped-Params). The request still runs.

import type { IRChatRequest } from "@core/ir";
import {
	irRequestsTwelveHourCache,
	routeSupportsTwelveHourCache,
	stripTwelveHourCache,
} from "@executors/_shared/text-generate/openai-compat/prompt-cache-ttl";
import type { DroppedParam } from "./unsupportedParams";

type RouteInfo = {
	models: Array<string | null | undefined>;
	pricingCard?: { rules?: Array<{ meter?: string }> } | null;
};

/** Removes a 12-hour cache request the route cannot take, and says which fields lost it. */
export function dropUnsupportedTwelveHourCache(
	ir: IRChatRequest,
	providerId: string,
	route: RouteInfo,
): { ir: IRChatRequest; dropped: DroppedParam[] } {
	if (!irRequestsTwelveHourCache(ir)) return { ir, dropped: [] };
	if (routeSupportsTwelveHourCache({ providerId, models: route.models, pricingCard: route.pricingCard })) {
		return { ir, dropped: [] };
	}
	const stripped = stripTwelveHourCache(ir);
	return {
		ir: stripped.ir,
		dropped: stripped.params.map((param): DroppedParam => ({
			param,
			reason: "value_not_supported",
			source: "provider_api",
			clientSent: true,
		})),
	};
}

type RankedCandidate = {
	candidate: {
		providerId: string;
		providerModelSlug?: string | null;
		pricingCard?: { rules?: Array<{ meter?: string }> } | null;
	};
};

/**
 * When the request asks for a 12-hour cache, routes that can take it go first, in their
 * existing order; the others stay behind them as fallbacks. A client-chosen provider order
 * is left alone.
 */
export function preferTwelveHourCacheRoutes<T extends RankedCandidate>(
	ranked: T[],
	ir: IRChatRequest,
	baseModel: string,
	options?: { explicitOrder?: boolean },
): T[] {
	if (options?.explicitOrder || ranked.length < 2 || !irRequestsTwelveHourCache(ir)) return ranked;
	const supports = (entry: T) => routeSupportsTwelveHourCache({
		providerId: entry.candidate.providerId,
		models: [entry.candidate.providerModelSlug, baseModel],
		pricingCard: entry.candidate.pricingCard,
	});
	const preferred = ranked.filter(supports);
	if (preferred.length === 0 || preferred.length === ranked.length) return ranked;
	return [...preferred, ...ranked.filter((entry) => !supports(entry))];
}

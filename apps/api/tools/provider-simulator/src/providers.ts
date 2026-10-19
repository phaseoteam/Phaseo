// Purpose: Which providers the simulator covers, and which catalogue routes stand in for each.
// Why: Coverage must follow what executors/index.ts actually registers, not a hand-kept list.
// How: Enumerates registered text executors, maps each id to its catalogue folder, and picks up to one
//      representative route per model family (Claude, Gemini, OpenAI, other).

import { EXECUTORS_BY_PROVIDER, resolveProviderExecutor } from "@executors/index";
import { normalizeProviderId } from "@/lib/config/providerAliases";
import { loadCatalogueRoutes, loadCataloguePriceCard, type CatalogueRoute } from "./catalogue";
import type { RouteUnderTest } from "./request-pipeline";

/** Registered ids whose catalogue folder has a different name. */
const CATALOGUE_FOLDER: Record<string, string> = {
	arcee: "arcee-ai",
	"atlas-cloud": "atlascloud",
	aionlabs: "aion-labs",
	liquid: "liquid-ai",
	"moonshot-ai": "moonshotai",
	"moonshot-ai-turbo": "moonshotai-turbo",
	novitaai: "novita",
};

export type ModelFamily = "claude" | "gemini" | "openai" | "other";

export function modelFamily(apiModelId: string): ModelFamily {
	const id = apiModelId.toLowerCase();
	if (/claude|anthropic\//.test(id)) return "claude";
	if (/gemini|google\/gemma/.test(id)) return "gemini";
	if (/^openai\/|\bgpt-|\/o[134]\b|\bo[134]-/.test(id)) return "openai";
	return "other";
}

const NOT_A_CHAT_MODEL = /guard|embed|rerank|tts|whisper|transcribe|babbage|davinci|moderation|ocr|image|vision-preview|audio|realtime|search-preview|lyria|veo|imagen|-instruct-legacy/i;

function paramNames(params: CatalogueRoute["capabilityParams"]): string[] {
	if (Array.isArray(params)) return params.map((entry: any) => (typeof entry === "string" ? entry : entry?.param_id ?? "")).filter(Boolean);
	return Object.keys(params ?? {});
}

function routeScore(route: CatalogueRoute): number {
	const params = new Set(paramNames(route.capabilityParams));
	let score = 0;
	if (route.active) score += 20;
	if (params.has("tools")) score += 8;
	if (params.has("reasoning") || params.has("reasoning_effort")) score += 3;
	if (params.has("response_format") || params.has("structured_outputs")) score += 2;
	if (route.inputModalities.includes("image")) score += 1;
	if (NOT_A_CHAT_MODEL.test(route.apiModelId)) score -= 30;
	if (route.routingStatus === "deprecated") score -= 2;
	if (/-exp\b|experimental|preview|-beta\b/i.test(route.apiModelId)) score -= 4;
	score += Math.min(3, Math.log10(Math.max(1, route.contextLength ?? 1)) - 3);
	return score;
}

export type SimProvider = {
	/** Provider id the run uses: the catalogue id when it has routes, as production routes on it. */
	providerId: string;
	/** Registered executor keys in executors/index.ts that resolve to this provider. */
	registeredIds: string[];
	catalogueId: string;
	executorName: string;
	routes: CatalogueRoute[];
	activeRouteCount: number;
	/** Representative routes driven through the executor. */
	sampled: RouteUnderTest[];
	placeholder: boolean;
};

function placeholderRoute(providerId: string): CatalogueRoute {
	return {
		providerId,
		apiModelId: "sim/placeholder-chat-model",
		providerModelSlug: "sim-placeholder-chat-model",
		active: false,
		routingStatus: null,
		inputModalities: ["text", "image"],
		maxOutputTokens: 32_768,
		contextLength: 200_000,
		capabilityParams: {},
		capabilityStatus: null,
		serviceTiers: [],
	};
}

export function listSimProviders(filter?: (id: string) => boolean): SimProvider[] {
	const catalogue = loadCatalogueRoutes();
	const out: SimProvider[] = [];
	const groups = new Map<string, string[]>();
	for (const [registeredId, capabilities] of Object.entries(EXECUTORS_BY_PROVIDER)) {
		if (!capabilities["text.generate"]) continue;
		const catalogueId = CATALOGUE_FOLDER[registeredId] ?? (catalogue.has(registeredId) ? registeredId : normalizeProviderId(registeredId));
		const key = catalogue.has(catalogueId) ? catalogueId : registeredId;
		groups.set(key, [...(groups.get(key) ?? []), registeredId]);
	}
	for (const [providerId, registeredIds] of groups) {
		if (filter && !filter(providerId)) continue;
		const executor = resolveProviderExecutor(providerId, "text.generate");
		if (!executor) continue;
		const catalogueId = catalogue.has(providerId) ? providerId : CATALOGUE_FOLDER[providerId] ?? providerId;
		const routes = catalogue.get(catalogueId) ?? [];
		const byFamily = new Map<ModelFamily, CatalogueRoute>();
		for (const route of [...routes].sort((a, b) => routeScore(b) - routeScore(a))) {
			const family = modelFamily(route.apiModelId);
			if (!byFamily.has(family)) byFamily.set(family, route);
		}
		const order: ModelFamily[] = ["claude", "gemini", "openai", "other"];
		let picked = order.map((family) => byFamily.get(family)).filter((route): route is CatalogueRoute => Boolean(route));
		// Keep active routes only when the provider has any, and at most three.
		if (picked.some((route) => route.active)) picked = picked.filter((route) => route.active);
		picked = picked.slice(0, 3);
		const placeholder = picked.length === 0;
		if (placeholder) picked = [placeholderRoute(catalogueId)];
		out.push({
			providerId,
			registeredIds,
			catalogueId,
			executorName: executor.name || "executor",
			routes,
			activeRouteCount: routes.filter((route) => route.active).length,
			placeholder,
			sampled: picked.map((route) => ({
				providerId,
				executorProviderId: providerId,
				route,
				priceCard: loadCataloguePriceCard(catalogueId, route.apiModelId),
			})),
		});
	}
	return out;
}

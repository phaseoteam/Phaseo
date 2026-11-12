// Purpose: Gateway context and price cards for the end-to-end harness, built from the catalogue database rows.
// Why: fetchGatewayContext and loadPriceCard read the database through the gateway client, which the harness stubs;
//      it answers them from the rows src/catalogue.ts loaded once for the run.
// How: Route rows, capability params and price cards come from src/catalogue.ts; the case decides which routes are offered.

import type { PriceCard } from "@pipeline/pricing/types";
import { catalogueRouteRows, loadCataloguePriceCard, routeIsActive, type CatalogueRouteRow } from "../src/catalogue";
import { currentCase, harnessState, type SimRoute } from "./state";

type RouteRow = {
	providerId: string;
	apiModelId: string;
	providerModelSlug: string | null;
	inputModalities: string[];
	outputModalities: string[];
	maxOutputTokens: number | null;
	contextLength: number | null;
	capabilityParams: Record<string, any>;
	capabilities: string[];
};

function objectParams(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

/** The route row the gateway would pick for provider and model (an active one when there is one). */
function dbRouteRow(providerId: string, apiModelId: string): CatalogueRouteRow | null {
	const rows = catalogueRouteRows(providerId, apiModelId);
	return rows.find((row) => routeIsActive(row)) ?? rows[0] ?? null;
}

export function findRouteRow(providerId: string, apiModelId: string): RouteRow | null {
	const row = dbRouteRow(providerId, apiModelId);
	if (!row) return null;
	const params: Record<string, any> = {};
	for (const cap of row.capabilities) Object.assign(params, objectParams(cap.params));
	return {
		providerId,
		apiModelId,
		providerModelSlug: row.providerModelSlug,
		inputModalities: row.inputModalities,
		outputModalities: row.outputModalities,
		maxOutputTokens: row.maxOutputTokens,
		contextLength: row.contextLength,
		capabilityParams: params,
		capabilities: row.capabilities.map((cap) => cap.capabilityId),
	};
}

/** Capability-specific params (a route row can list several capabilities with different params). */
function capabilityParamsFor(providerId: string, apiModelId: string, capabilities: string[]): Record<string, any> {
	const cap = dbRouteRow(providerId, apiModelId)?.capabilities.find((entry) => capabilities.includes(entry.capabilityId));
	return objectParams(cap?.params);
}

/** SKU operations use several names for one capability; the database loader resolves the same aliases. */
export const PRICING_CAPABILITY_ALIASES: Record<string, string[]> = {
	"text.generate": ["text.generate"],
	embeddings: ["embeddings", "text.embed"],
	moderations: ["moderations", "text.moderate", "moderations.create"],
	rerank: ["rerank", "text.rerank", "rerank.create"],
	"image.generate": ["image.generate", "image.generations", "images.generations", "images.generate"],
	"image.edit": ["image.edit", "images.edits"],
	"audio.speech": ["audio.speech", "audio.generate"],
	"audio.transcription": ["audio.transcription", "audio.transcribe"],
	"audio.translations": ["audio.translations"],
	ocr: ["ocr"],
	parse: ["parse"],
	"video.generate": ["video.generate"],
	"music.generate": ["music.generate"],
};

export function cataloguePriceCard(providerId: string, apiModelId: string, capability: string): PriceCard | null {
	for (const alias of PRICING_CAPABILITY_ALIASES[capability] ?? [capability]) {
		const card = loadCataloguePriceCard(providerId, apiModelId, alias);
		if (card) return { ...card, endpoint: capability } as PriceCard;
	}
	return null;
}

function pricingKeyFor(providerId: string, apiModelId: string, slug: string | null): string {
	// Mirrors pipeline/before/context.shared.ts getProviderPricingKey.
	const route = slug?.trim().toLowerCase();
	return route ? `${providerId}:${apiModelId}:${route}` : `${providerId}:${apiModelId}`;
}

const ROUTE_CAPABILITY_ALIASES: Record<string, string[]> = {
	"text.generate": ["text.generate"],
	embeddings: ["text.embed", "embeddings"],
	moderations: ["text.moderate", "moderations", "moderations.create"],
	rerank: ["rerank", "text.rerank"],
	"image.generate": ["image.generate", "images.generations"],
	"image.edit": ["image.edit", "images.edits"],
	"audio.speech": ["audio.speech", "audio.generate"],
	"audio.transcription": ["audio.transcription", "audio.transcribe"],
	"audio.translations": ["audio.translations"],
	ocr: ["ocr"],
	parse: ["parse"],
	"video.generate": ["video.generate"],
	"music.generate": ["music.generate"],
};

function snapshotFor(route: SimRoute, capability: string) {
	const row = findRouteRow(route.providerId, route.apiModelId);
	if (!row) throw new Error(`e2e harness: catalogue has no route ${route.providerId} ${route.apiModelId}`);
	const capabilityParams = capabilityParamsFor(route.providerId, route.apiModelId, ROUTE_CAPABILITY_ALIASES[capability] ?? [capability]);
	const pricingKey = pricingKeyFor(route.providerId, route.apiModelId, row.providerModelSlug);
	const card = cataloguePriceCard(route.providerId, route.apiModelId, capability);
	harnessState.captures.priceCardLookups.push({ provider: route.providerId, model: route.apiModelId, capability, found: Boolean(card) });
	return {
		pricingKey,
		card,
		snapshot: {
			accessScope: "public" as const,
			providerId: route.providerId,
			credentialMode: route.credentialMode ?? "managed_and_byok",
			apiModelId: route.apiModelId,
			pricingKey,
			providerStatus: "active",
			providerRoutingStatus: "active",
			modelRoutingStatus: "active",
			capabilityStatus: "active",
			supportsEndpoint: true,
			baseWeight: 1,
			byokMeta: (route.byok ?? []).map((key) => ({
				id: key.id,
				providerId: route.providerId,
				fingerprintSha256: `sim-fingerprint-${key.id}`,
				keyVersion: "1",
				alwaysUse: key.alwaysUse ?? key.routingMode === "priority",
				routingMode: key.routingMode,
				sortOrder: key.sortOrder ?? 0,
				allowedModelSlugs: null,
				allowedApiKeyIds: null,
				key: key.key,
			})),
			providerModelSlug: row.providerModelSlug,
			inputModalities: row.inputModalities,
			outputModalities: row.outputModalities,
			capabilityParams,
			maxInputTokens: row.contextLength,
			maxOutputTokens: row.maxOutputTokens,
			// Data-policy evidence is not under test here; mark routes as private so privacy filters never drop them.
			dataPolicyTier: "private" as const,
			dataPolicyConfidence: "confirmed" as const,
			promptTrainingPolicy: "no_train" as const,
			zeroDataRetention: true,
		},
	};
}

/** Answers fetchGatewayContext for the case in flight. */
export function buildGatewayContext(args: { workspaceId: string; model: string; endpoint: string }) {
	const runtime = currentCase();
	let model = args.model;
	let preset = null as any;
	if (runtime.presetModel && model === runtime.presetModel && runtime.preset) {
		preset = { ...runtime.preset, description: null, visibility: "team" };
		model = String((runtime.preset.config as any).defaultModel ?? (runtime.preset.config as any).model ?? model);
	}
	const routes = runtime.routesByModel[model] ?? [];
	harnessState.captures.contextLookups.push({ model: args.model, endpoint: args.endpoint, found: routes.length > 0 });
	const providers: any[] = [];
	const pricing: Record<string, PriceCard> = {};
	for (const route of routes) {
		const built = snapshotFor(route, runtime.capability);
		providers.push(built.snapshot);
		if (built.card) pricing[built.pricingKey] = built.card;
	}
	const ok = { ok: true, reason: null, resetAt: null };
	return {
		workspaceId: args.workspaceId,
		endpoint: args.endpoint,
		resolvedModel: model,
		preset,
		key: ok,
		keyLimit: ok,
		credit: { ...ok, balanceNanos: 50_000_000_000 },
		providers,
		pricing,
		teamEnrichment: null,
		keyEnrichment: null,
		teamSettings: {
			routingMode: null,
			byokFallbackEnabled: false,
			betaChannelEnabled: false,
			alphaChannelEnabled: false,
			cacheAwareRoutingEnabled: false,
			billingMode: "wallet",
			...runtime.teamSettings,
		},
		testingMode: false,
		contextTelemetry: { cacheStatus: "bypass", totalMs: 0 },
	};
}

/** Answers loadPriceCard (after-stage re-reads and executor fallbacks) from the catalogue rows. */
export function lookupPriceCard(provider: string, model: string, capability: string): PriceCard | null {
	const normalised = capability === "embeddings" || capability === "text.embed" ? "embeddings" : capability;
	const card = cataloguePriceCard(provider, model, normalised);
	harnessState.captures.priceCardLookups.push({ provider, model, capability, found: Boolean(card) });
	return card;
}

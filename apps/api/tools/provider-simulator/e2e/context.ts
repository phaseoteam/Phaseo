// Purpose: Gateway context and price cards for the end-to-end harness, built from the catalogue fixtures.
// Why: fetchGatewayContext and loadPriceCard read the database; the harness must answer them offline with real rows.
// How: Route rows and pricing come from packages/data/catalog/src/data; the case decides which routes are offered.

import fs from "node:fs";
import path from "node:path";
import type { PriceCard } from "@pipeline/pricing/types";
import { CATALOGUE_ROOT, loadCataloguePriceCard } from "../src/catalogue";
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

let rowIndex: Map<string, RouteRow> | null = null;

function splitList(value: unknown, fallback: string): string[] {
	return String(value ?? fallback).split(",").map((entry) => entry.trim()).filter(Boolean);
}

/** Every catalogue route row, keyed by `${providerId}|${apiModelId}`. */
function routeRows(): Map<string, RouteRow> {
	if (rowIndex) return rowIndex;
	rowIndex = new Map();
	const root = path.join(CATALOGUE_ROOT, "api_providers");
	for (const providerId of fs.readdirSync(root)) {
		const file = path.join(root, providerId, "models.json");
		if (!fs.existsSync(file)) continue;
		for (const row of JSON.parse(fs.readFileSync(file, "utf8")) as any[]) {
			const capabilities = (row.capabilities ?? []) as any[];
			const params: Record<string, any> = {};
			for (const cap of capabilities) {
				if (cap.params && typeof cap.params === "object" && !Array.isArray(cap.params)) Object.assign(params, cap.params);
			}
			rowIndex.set(`${providerId}|${row.api_model_id}`, {
				providerId,
				apiModelId: row.api_model_id,
				providerModelSlug: row.provider_model_slug ?? null,
				inputModalities: splitList(row.input_modalities, "text"),
				outputModalities: splitList(row.output_modalities, "text"),
				maxOutputTokens: typeof row.max_output_tokens === "number" ? row.max_output_tokens : null,
				contextLength: typeof row.context_length === "number" ? row.context_length : null,
				capabilityParams: params,
				capabilities: capabilities.map((cap) => String(cap.capability_id)),
			});
		}
	}
	return rowIndex;
}

/** Capability-specific params (a route row can list several capabilities with different params). */
function capabilityParamsFor(providerId: string, apiModelId: string, capabilities: string[]): Record<string, any> {
	const file = path.join(CATALOGUE_ROOT, "api_providers", providerId, "models.json");
	const rows = JSON.parse(fs.readFileSync(file, "utf8")) as any[];
	const row = rows.find((entry) => entry.api_model_id === apiModelId);
	const cap = (row?.capabilities ?? []).find((entry: any) => capabilities.includes(entry.capability_id));
	return cap?.params && typeof cap.params === "object" && !Array.isArray(cap.params) ? cap.params : {};
}

export function findRouteRow(providerId: string, apiModelId: string): RouteRow | null {
	return routeRows().get(`${providerId}|${apiModelId}`) ?? null;
}

/** Pricing fixtures use several names for one capability; the database loader resolves the same aliases. */
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
			// The fixtures carry no data-policy evidence; mark routes as private so privacy filters never drop them.
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

/** Answers loadPriceCard (after-stage re-reads and executor fallbacks) from the fixtures. */
export function lookupPriceCard(provider: string, model: string, capability: string): PriceCard | null {
	const normalised = capability === "embeddings" || capability === "text.embed" ? "embeddings" : capability;
	const card = cataloguePriceCard(provider, model, normalised);
	harnessState.captures.priceCardLookups.push({ provider, model, capability, found: Boolean(card) });
	return card;
}

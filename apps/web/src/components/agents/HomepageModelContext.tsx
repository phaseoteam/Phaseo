import { useEffect } from "react";
import { encodeModelIdForUrl } from "@/components/(data)/compare/compareUrl";
import {
	API_DOCS_URL,
	API_QUICKSTART_URL,
} from "@/lib/agent-discovery-client";

// WebMCP: Chrome exposes `document.modelContext.registerTool(tool, { signal })` and
// unregisters a tool when the signal aborts. Earlier builds and polyfills expose
// `navigator.modelContext.provideContext({ tools })`, which is kept as a fallback.
// See https://developer.chrome.com/docs/ai/webmcp/imperative-api.

type ToolInput = Record<string, unknown>;

export type ModelContextTool = {
	annotations?: {
		readOnlyHint?: boolean;
	};
	description: string;
	execute: (input: ToolInput, options?: { signal?: AbortSignal }) => Promise<string>;
	inputSchema?: Record<string, unknown>;
	name: string;
	title?: string;
};

type DocumentModelContext = {
	registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
};

type LegacyModelContext = {
	provideContext?: (context: { tools: LegacyModelContextTool[] }) => void;
	clearContext?: () => void;
};

type LegacyModelContextTool = Omit<ModelContextTool, "execute"> & {
	execute: (input: ToolInput) => Promise<{ content: { type: "text"; text: string }[] }>;
};

const TOOL_TARGETS = {
	apiDocsUrl: API_DOCS_URL,
	apiQuickstartUrl: API_QUICKSTART_URL,
	modelsUrl: "/models",
	pricingUrl: "/pricing",
	apiCatalogUrl: "/.well-known/api-catalog",
};

// The same public catalogue request the models page makes, so it is usually an edge cache hit.
// The endpoint caps a page at 2,000 rows.
const CATALOGUE_PAGE_SIZE = 2000;
const catalogueUrl = (offset: number) => `/api/_web/models?limit=${CATALOGUE_PAGE_SIZE}&offset=${offset}&shape=page&projection=6&catalogue_version=v2&include_metrics=false`;
const SEARCH_LIMIT_MAX = 20;
const COMPARE_MAX = 4;

type CatalogueModel = {
	model_id: string;
	name?: string | null;
	organisation_name?: string | null;
	status?: string | null;
	gateway_status?: string | null;
	primary_date?: string | null;
	context_lengths?: number[] | null;
	gateway_input_modalities?: string[] | null;
	gateway_output_modalities?: string[] | null;
	gateway_active_provider_names?: string[] | null;
	gateway_tiers?: string[] | null;
	pricing_summary?: unknown;
	pricing_detail_rows?: { label?: string; value?: string }[] | null;
};

function absoluteUrl(path: string) {
	return new URL(path, window.location.origin).toString();
}

function navigateTo(url: string) {
	const target = url.startsWith("http") ? url : absoluteUrl(url);
	window.location.href = target;
	return JSON.stringify({ ok: true, url: target });
}

/** A compact, agent-friendly view of one catalogue row. */
export function summariseModel(model: CatalogueModel, detail = false) {
	const summary = {
		id: model.model_id,
		name: model.name ?? model.model_id,
		organisation: model.organisation_name ?? null,
		status: model.status ?? null,
		callable_on_phaseo: model.gateway_status === "active",
		released: model.primary_date ? model.primary_date.slice(0, 10) : null,
		context_length: model.context_lengths?.length ? Math.max(...model.context_lengths) : null,
		input_modalities: model.gateway_input_modalities ?? [],
		output_modalities: model.gateway_output_modalities ?? [],
		providers: model.gateway_active_provider_names ?? [],
		pricing: model.pricing_summary ?? null,
		url: absoluteUrl(`/models/${model.model_id}`),
	};
	if (!detail) return summary;
	return {
		...summary,
		service_tiers: model.gateway_tiers ?? [],
		prices: (model.pricing_detail_rows ?? []).flatMap((row) => row.label && row.value ? [{ label: row.label, value: row.value }] : []),
	};
}

async function fetchCataloguePage(path: string, signal?: AbortSignal) {
	const response = await fetch(path, { headers: { accept: "application/json" }, signal });
	if (!response.ok) throw new Error(`The Phaseo model catalogue returned ${response.status}.`);
	const body = await response.json() as { models?: CatalogueModel[]; total?: number };
	return { models: body.models ?? [], total: typeof body.total === "number" ? body.total : 0 };
}

async function fetchCatalogue(path: string, signal?: AbortSignal): Promise<CatalogueModel[]> {
	return (await fetchCataloguePage(path, signal)).models;
}

/** Every catalogue row: the first page is the models page's own request, later pages follow `total`. */
async function fetchWholeCatalogue(signal?: AbortSignal): Promise<CatalogueModel[]> {
	const first = await fetchCataloguePage(catalogueUrl(0), signal);
	const models = [...first.models];
	for (let offset = CATALOGUE_PAGE_SIZE; offset < first.total && first.models.length > 0; offset += CATALOGUE_PAGE_SIZE) {
		models.push(...(await fetchCataloguePage(catalogueUrl(offset), signal)).models);
	}
	return models;
}

export function compareUrl(ids: string[]) {
	const query = ids.map((id) => `models=${encodeURIComponent(encodeModelIdForUrl(id))}`).join("&");
	return absoluteUrl(`/compare?${query}`);
}

export function createHomepageTools(): ModelContextTool[] {
	return [
		{
			name: "get-phaseo-discovery",
			title: "Get discovery metadata",
			description:
				"Return the Phaseo homepage, API catalog, API docs, quickstart docs, and pricing/model URLs for agent use.",
			annotations: { readOnlyHint: true },
			execute: async () => JSON.stringify({
				homepageUrl: window.location.origin,
				...TOOL_TARGETS,
			}),
		},
		{
			name: "search-phaseo-models",
			title: "Search models",
			description:
				"Search the public Phaseo model catalogue by model name, for example \"claude sonnet\" or \"gpt-5\". Returns each match's Phaseo model ID (use it as `model` in API requests), organisation, whether it can be called through Phaseo, context length, modalities, providers and headline pricing.",
			annotations: { readOnlyHint: true },
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", minLength: 1, maxLength: 100, description: "Words from the model name." },
					limit: { type: "integer", minimum: 1, maximum: SEARCH_LIMIT_MAX, description: `Maximum results (default 10, at most ${SEARCH_LIMIT_MAX}).` },
				},
				required: ["query"],
			},
			execute: async (input, options) => {
				const query = typeof input.query === "string" ? input.query.trim().slice(0, 100) : "";
				if (!query) throw new Error("query is required.");
				const limit = Math.min(SEARCH_LIMIT_MAX, Math.max(1, Math.trunc(Number(input.limit) || 10)));
				const path = `/api/_web/models?limit=${limit}&offset=0&shape=page&projection=6&catalogue_version=v2&include_metrics=false&search=${encodeURIComponent(query)}`;
				const models = await fetchCatalogue(path, options?.signal);
				return JSON.stringify({ query, results: models.map((model) => summariseModel(model)) });
			},
		},
		{
			name: "compare-phaseo-models",
			title: "Compare models",
			description:
				`Compare 2 to ${COMPARE_MAX} models from the public Phaseo catalogue side by side by their Phaseo model IDs (for example "anthropic/claude-sonnet-5.5"; find IDs with search-phaseo-models). Returns each model's context length, modalities, providers, service tiers and prices, plus a link to the comparison page.`,
			annotations: { readOnlyHint: true },
			inputSchema: {
				type: "object",
				properties: {
					model_ids: {
						type: "array",
						items: { type: "string", minLength: 3, maxLength: 200 },
						minItems: 2,
						maxItems: COMPARE_MAX,
						description: "Phaseo model IDs in organisation/model form.",
					},
				},
				required: ["model_ids"],
			},
			execute: async (input, options) => {
				const ids = Array.isArray(input.model_ids)
					? [...new Set(input.model_ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))]
					: [];
				if (ids.length < 2 || ids.length > COMPARE_MAX) throw new Error(`model_ids needs 2 to ${COMPARE_MAX} distinct model IDs.`);
				const byId = new Map((await fetchWholeCatalogue(options?.signal)).map((model) => [model.model_id, model]));
				return JSON.stringify({
					models: ids.flatMap((id) => {
						const model = byId.get(id);
						return model ? [summariseModel(model, true)] : [];
					}),
					not_found: ids.filter((id) => !byId.has(id)),
					compare_url: compareUrl(ids),
				});
			},
		},
		{
			name: "open-phaseo-models",
			title: "Open models page",
			description:
				"Open the public Phaseo models page for browsing the model catalogue.",
			annotations: { readOnlyHint: true },
			execute: async () => navigateTo(TOOL_TARGETS.modelsUrl),
		},
		{
			name: "open-phaseo-api-docs",
			title: "Open API docs",
			description:
				"Open the Phaseo Gateway API reference documentation.",
			annotations: { readOnlyHint: true },
			execute: async () => navigateTo(TOOL_TARGETS.apiDocsUrl),
		},
		{
			name: "open-phaseo-pricing",
			title: "Open pricing",
			description:
				"Open the Phaseo pricing page for the gateway and model pricing context.",
			annotations: { readOnlyHint: true },
			execute: async () => navigateTo(TOOL_TARGETS.pricingUrl),
		},
	];
}

/**
 * Registers the tools with whichever WebMCP entry point the browser has and
 * returns a function that removes them again.
 */
export function registerHomepageTools(tools: ModelContextTool[], doc: Document = document, nav: Navigator = navigator): () => void {
	const documentContext = (doc as Document & { modelContext?: Partial<DocumentModelContext> }).modelContext;
	if (typeof documentContext?.registerTool === "function") {
		const controller = new AbortController();
		for (const tool of tools) {
			try {
				// A name clash or an invalid schema rejects one tool; keep the others.
				void Promise.resolve(documentContext.registerTool(tool, { signal: controller.signal })).catch(() => undefined);
			} catch {
				// Same as above, for implementations that throw synchronously.
			}
		}
		return () => controller.abort();
	}

	const legacyContext = (nav as Navigator & { modelContext?: LegacyModelContext }).modelContext;
	if (typeof legacyContext?.provideContext === "function") {
		legacyContext.provideContext({
			tools: tools.map((tool) => ({
				...tool,
				execute: async (input: ToolInput) => ({ content: [{ type: "text" as const, text: await tool.execute(input) }] }),
			})),
		});
		return () => legacyContext.clearContext?.();
	}

	return () => undefined;
}

export function HomepageModelContext() {
	useEffect(() => registerHomepageTools(createHomepageTools()), []);

	return null;
}

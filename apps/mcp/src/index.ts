import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	authenticatePhaseoUser,
	type AuthenticatedPhaseoUser,
	type PhaseoEnv,
	type PhaseoApiKey,
	getModel,
	listApiKeys,
	listModels,
	listProviders,
	PhaseoApiError,
	readControlPlane,
	requestPhaseo,
} from "./phaseo-api";
import {
	MCP_DELETE_SCOPES,
	MCP_WRITE_SCOPES,
	registerMutationTools,
} from "./mutation-tools";

const MAX_RESULTS = 20;
const MAX_MCP_REQUEST_BODY_BYTES = 1024 * 1024;

async function boundedMcpRequest(request: Request): Promise<Request | Response> {
	const contentLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_MCP_REQUEST_BODY_BYTES) {
		return new Response("MCP request body is too large.", { status: 413 });
	}
	if (!request.body) return request;
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > MAX_MCP_REQUEST_BODY_BYTES) {
				await reader.cancel();
				return new Response("MCP request body is too large.", { status: 413 });
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const headers = new Headers(request.headers);
	headers.delete("content-length");
	return new Request(request, { headers, body });
}
const READ_ONLY_MCP_SCOPES = [
	"me:read",
	"models:read",
	"providers:read",
	"pricing:read",
	"credits:read",
	"activity:read",
	"analytics:read",
	"generations:read",
	"workspaces:read",
	"keys:read",
	"presets:read",
	"settings:read",
	"guardrails:read",
	"management_keys:read",
	"oauth_clients:read",
] as const;

type QueryValue = string | number | boolean | undefined;
type ReadToolInput = Record<string, unknown>;

type ReadToolDefinition = {
	name: string;
	title: string;
	description: string;
	scopes: readonly string[];
	inputSchema: z.ZodRawShape;
	path: (input: ReadToolInput) => string;
	query?: (input: ReadToolInput) => Record<string, QueryValue>;
};

const paginationInputSchema = {
	limit: z.number().int().min(1).max(250).optional(),
	offset: z.number().int().nonnegative().optional(),
};

const controlPlaneReadTools: ReadToolDefinition[] = [
	{
		name: "account_get",
		title: "Get the current Phaseo account",
		description: "Get the authenticated user, current workspace, and workspace memberships. Read-only.",
		scopes: ["me:read"],
		inputSchema: {},
		path: () => "/v1/me",
	},
	{
		name: "organisations_list",
		title: "List model organisations",
		description: "List organisations represented in Phaseo's live model catalogue. Read-only.",
		scopes: ["models:read"],
		inputSchema: paginationInputSchema,
		path: () => "/v1/organisations",
		query: ({ limit, offset }) => ({ limit: limit as number | undefined, offset: offset as number | undefined }),
	},
	{
		name: "endpoints_list",
		title: "List Phaseo API endpoints",
		description: "List the inference endpoint families supported by the Phaseo API and sample current model IDs. Read-only; does not run inference.",
		scopes: ["models:read"],
		inputSchema: {},
		path: () => "/v1/endpoints",
	},
	{
		name: "pricing_models_list",
		title: "List model pricing",
		description: "Retrieve the current Phaseo model pricing catalogue. Read-only.",
		scopes: ["pricing:read"],
		inputSchema: {},
		path: () => "/v1/pricing/models",
	},
	{
		name: "credits_get",
		title: "Get Phaseo credit balance",
		description: "Get current credit and usage totals for the authenticated workspace. Read-only.",
		scopes: ["credits:read"],
		inputSchema: {},
		path: () => "/v1/credits",
	},
	{
		name: "activity_list",
		title: "List Phaseo activity",
		description: "List recent billable gateway activity for the authenticated workspace. Read-only.",
		scopes: ["activity:read"],
		inputSchema: { days: z.number().int().min(1).max(90).optional(), ...paginationInputSchema },
		path: () => "/v1/activity",
		query: ({ days, limit, offset }) => ({ days: days as number | undefined, limit: limit as number | undefined, offset: offset as number | undefined }),
	},
	{
		name: "analytics_get",
		title: "Get Phaseo analytics",
		description: "Get model and provider usage analytics for a workspace and optional date. Read-only.",
		scopes: ["analytics:read"],
		inputSchema: { date: z.string().date().optional() },
		path: () => "/v1/analytics",
		query: ({ date }) => ({ date: date as string | undefined }),
	},
	{
		name: "generation_get",
		title: "Get a Phaseo generation",
		description: "Retrieve cost, routing, token, and provider metadata for one Phaseo request ID. Read-only.",
		scopes: ["generations:read"],
		inputSchema: { requestId: z.string().min(1).max(200) },
		path: () => "/v1/generations",
		query: ({ requestId }) => ({ id: requestId as string }),
	},
	{
		name: "logs_list",
		title: "List Phaseo request logs",
		description: "Search request logs by time, status, provider, model, endpoint, request, key, session, or error code. Read-only.",
		scopes: ["activity:read"],
		inputSchema: {
			since: z.string().max(50).optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(),
			status: z.string().max(50).optional(), provider: z.string().max(100).optional(), model: z.string().max(200).optional(),
			endpoint: z.string().max(100).optional(), requestId: z.string().max(200).optional(), keyId: z.string().max(200).optional(),
			sessionId: z.string().max(200).optional(), errorCode: z.string().max(100).optional(), ...paginationInputSchema,
		},
		path: () => "/v1/logs",
		query: (input) => ({
			since: input.since as string | undefined, from: input.from as string | undefined, to: input.to as string | undefined,
			status: input.status as string | undefined, provider: input.provider as string | undefined, model: input.model as string | undefined,
			endpoint: input.endpoint as string | undefined, request_id: input.requestId as string | undefined, key_id: input.keyId as string | undefined,
			session_id: input.sessionId as string | undefined, error_code: input.errorCode as string | undefined,
			limit: input.limit as number | undefined, offset: input.offset as number | undefined,
		}),
	},
	{
		name: "log_get",
		title: "Get a Phaseo request log",
		description: "Retrieve one request log by request ID. Read-only.",
		scopes: ["activity:read"],
		inputSchema: { requestId: z.string().min(1).max(200) },
		path: ({ requestId }) => `/v1/logs/${encodeURIComponent(String(requestId))}`,
	},
	{
		name: "workspaces_list",
		title: "List Phaseo workspaces",
		description: "List workspaces available to the authenticated user. Read-only.",
		scopes: ["workspaces:read"],
		inputSchema: {},
		path: () => "/v1/workspaces",
	},
	{
		name: "workspace_get",
		title: "Get a Phaseo workspace",
		description: "Get one workspace by ID or slug. Read-only.",
		scopes: ["workspaces:read"],
		inputSchema: { workspaceId: z.string().min(1).max(200) },
		path: ({ workspaceId }) => `/v1/workspaces/${encodeURIComponent(String(workspaceId))}`,
	},
	{
		name: "workspace_members_list",
		title: "List Phaseo workspace members",
		description: "List members and roles for one workspace. Read-only.",
		scopes: ["workspaces:read"],
		inputSchema: { workspaceId: z.string().min(1).max(200) },
		path: ({ workspaceId }) => `/v1/workspaces/${encodeURIComponent(String(workspaceId))}/members`,
	},
	{
		name: "api_key_get",
		title: "Get a Phaseo Gateway API key",
		description: "Get metadata for one Gateway API key without returning its secret. Read-only.",
		scopes: ["keys:read"],
		inputSchema: { keyId: z.string().min(1).max(200) },
		path: ({ keyId }) => `/v1/keys/${encodeURIComponent(String(keyId))}`,
	},
	{
		name: "presets_list",
		title: "List Phaseo routing presets",
		description: "List routing presets for the authenticated workspace. Read-only.",
		scopes: ["presets:read"], inputSchema: {}, path: () => "/v1/presets",
	},
	{
		name: "preset_get",
		title: "Get a Phaseo routing preset",
		description: "Get one routing preset by ID, slug, or name. Read-only.",
		scopes: ["presets:read"], inputSchema: { presetId: z.string().min(1).max(200) },
		path: ({ presetId }) => `/v1/presets/${encodeURIComponent(String(presetId))}`,
	},
	{
		name: "settings_get", title: "Get Phaseo workspace settings",
		description: "Get routing and gateway settings for the authenticated workspace. Read-only.",
		scopes: ["settings:read"], inputSchema: {}, path: () => "/v1/settings",
	},
	{
		name: "guardrails_list", title: "List Phaseo guardrails",
		description: "List guardrails configured for the authenticated workspace. Read-only.",
		scopes: ["guardrails:read"], inputSchema: {}, path: () => "/v1/guardrails",
	},
	{
		name: "guardrail_get", title: "Get a Phaseo guardrail",
		description: "Get one guardrail configuration. Read-only.",
		scopes: ["guardrails:read"], inputSchema: { guardrailId: z.string().min(1).max(200) },
		path: ({ guardrailId }) => `/v1/guardrails/${encodeURIComponent(String(guardrailId))}`,
	},
	{
		name: "guardrail_keys_list", title: "List keys assigned to a guardrail",
		description: "List Gateway API keys assigned to one guardrail. Does not return key secrets. Read-only.",
		scopes: ["guardrails:read"], inputSchema: { guardrailId: z.string().min(1).max(200) },
		path: ({ guardrailId }) => `/v1/guardrails/${encodeURIComponent(String(guardrailId))}/keys`,
	},
	{
		name: "guardrail_members_list", title: "List members assigned to a guardrail",
		description: "List workspace members assigned to one guardrail. Read-only.",
		scopes: ["guardrails:read"], inputSchema: { guardrailId: z.string().min(1).max(200) },
		path: ({ guardrailId }) => `/v1/guardrails/${encodeURIComponent(String(guardrailId))}/members`,
	},
	{
		name: "management_keys_list", title: "List Phaseo management keys",
		description: "List management API key metadata without returning secrets. Read-only.",
		scopes: ["management_keys:read"], inputSchema: {}, path: () => "/v1/management-keys",
	},
	{
		name: "management_key_get", title: "Get a Phaseo management key",
		description: "Get metadata and granted scopes for one management API key without returning its secret. Read-only.",
		scopes: ["management_keys:read"], inputSchema: { keyId: z.string().min(1).max(200) },
		path: ({ keyId }) => `/v1/management-keys/${encodeURIComponent(String(keyId))}`,
	},
	{
		name: "oauth_clients_list", title: "List Phaseo OAuth clients",
		description: "List third-party OAuth applications registered in the authenticated workspace. Does not return client secrets. Read-only.",
		scopes: ["oauth_clients:read"], inputSchema: {}, path: () => "/v1/oauth-clients",
	},
	{
		name: "oauth_client_get", title: "Get a Phaseo OAuth client",
		description: "Get one registered OAuth application's metadata, redirect URIs, and scopes without returning its secret. Read-only.",
		scopes: ["oauth_clients:read"], inputSchema: { clientId: z.string().min(1).max(200) },
		path: ({ clientId }) => `/v1/oauth-clients/${encodeURIComponent(String(clientId))}`,
	},
	{
		name: "webhook_endpoints_list", title: "List Phaseo webhook endpoints",
		description: "List configured async webhook endpoints without returning signing secrets. Available only where the Batch API feature is enabled. Read-only.",
		scopes: ["settings:read"], inputSchema: { ...paginationInputSchema, includeDeleted: z.boolean().optional() }, path: () => "/v1/webhook-endpoints",
		query: ({ limit, offset, includeDeleted }) => ({ limit: limit as number | undefined, offset: offset as number | undefined, include_deleted: includeDeleted as boolean | undefined }),
	},
	{
		name: "webhook_endpoint_get", title: "Get a Phaseo webhook endpoint",
		description: "Get one async webhook endpoint without returning its signing secret. Available only where the Batch API feature is enabled. Read-only.",
		scopes: ["settings:read"], inputSchema: { endpointId: z.string().min(1).max(200) },
		path: ({ endpointId }) => `/v1/webhook-endpoints/${encodeURIComponent(String(endpointId))}`,
	},
];

const modelSummarySchema = {
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	provider: z.string().nullable(),
	contextTokens: z.number().int().nullable(),
	inputModalities: z.array(z.string()),
	outputModalities: z.array(z.string()),
	inputPricePerToken: z.string().nullable(),
	outputPricePerToken: z.string().nullable(),
	supportsTools: z.boolean(),
	availableProviders: z.array(z.string()),
};

const providerSchema = {
	api_provider_id: z.string(),
	api_provider_name: z.string().nullable(),
	description: z.string().nullable(),
	link: z.string().nullable(),
	country_code: z.string().nullable(),
};

const apiKeySchema = {
	id: z.string(),
	name: z.string().nullable(),
	prefix: z.string().nullable(),
	status: z.string().nullable(),
	created_at: z.string().nullable(),
	last_used_at: z.string().nullable(),
	expires_at: z.string().nullable(),
	disabled: z.boolean(),
	limit: z.number().nullable(),
	limit_reset: z.enum(["daily", "weekly", "monthly"]).nullable(),
};

function oauthToolMeta(scopes: readonly string[]) {
	return { securitySchemes: [{ type: "oauth2", scopes: [...scopes] }] };
}

function normalise(value: string | null | undefined): string {
	return value?.trim().toLowerCase() ?? "";
}

function tokenRate(value: string | null | undefined): number | null {
	if (value === null || value === undefined || value.trim() === "") return null;
	const rate = Number(value);
	return Number.isFinite(rate) ? rate : null;
}

function modelSummary(model: Awaited<ReturnType<typeof listModels>>[number]) {
	return {
		id: model.id,
		name: model.name,
		description: model.description,
		provider: model.organisation?.name ?? null,
		contextTokens: model.context_length ?? model.top_provider?.context_length ?? null,
		inputModalities: model.architecture.input_modalities,
		outputModalities: model.architecture.output_modalities,
		inputPricePerToken: model.pricing.prompt ?? null,
		outputPricePerToken: model.pricing.completion ?? null,
		supportsTools: model.supported_parameters.includes("tools"),
		availableProviders: model.providers.map((provider) => provider.api_provider_id),
	};
}

function providerSummary(provider: Awaited<ReturnType<typeof listProviders>>[number]) {
	return {
		api_provider_id: provider.api_provider_id,
		api_provider_name: provider.api_provider_name,
		description: provider.description,
		link: provider.link,
		country_code: provider.country_code,
	};
}

function apiKeySummary(key: PhaseoApiKey) {
	return {
		id: key.id,
		name: key.name,
		prefix: key.prefix,
		status: key.status,
		created_at: key.created_at,
		last_used_at: key.last_used_at,
		expires_at: key.expires_at,
		disabled: key.disabled,
		limit: key.limit,
		limit_reset: key.limit_reset,
	};
}

function errorResult(error: unknown) {
	const message = error instanceof PhaseoApiError ? error.message : "Phaseo could not complete this request.";
	return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function hasScopes(authenticatedUser: AuthenticatedPhaseoUser, scopes: readonly string[]): boolean {
	return scopes.every((scope) => authenticatedUser.scopes.includes(scope));
}

function registerControlPlaneReadTools(
	server: McpServer,
	env: PhaseoEnv,
	authenticatedUser: AuthenticatedPhaseoUser,
): void {
	for (const definition of controlPlaneReadTools) {
		if (!hasScopes(authenticatedUser, definition.scopes)) continue;
		server.registerTool(
			definition.name,
			{
				title: definition.title,
				description: definition.description,
				inputSchema: definition.inputSchema,
				outputSchema: { result: z.record(z.string(), z.unknown()) },
				annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
				_meta: oauthToolMeta(definition.scopes),
			},
			async (input) => {
				try {
					const result = await readControlPlane(
						env,
						definition.path(input),
						{ accessToken: authenticatedUser.accessToken },
						definition.query?.(input) ?? {},
					);
					return {
						content: [{ type: "text" as const, text: `${definition.title} completed.` }],
						structuredContent: { result },
					};
				} catch (error) {
					return errorResult(error);
				}
			},
		);
	}
}

export function createServer(env: PhaseoEnv, authenticatedUser: AuthenticatedPhaseoUser): McpServer {
	const server = new McpServer(
		{ name: "Phaseo", version: "0.2.0" },
		{
			instructions:
				"Phaseo provides live model, provider, pricing, and authenticated workspace data. For current availability or pricing questions, use Phaseo tools instead of relying on model memory. Treat cost results as estimates. Write tools may consume or expose sensitive account resources and must only be called after the user explicitly confirms the exact action.",
		},
	);

	if (
		authenticatedUser.scopes.includes("models:read") &&
		authenticatedUser.scopes.includes("pricing:read")
	) server.registerTool(
		"models_list",
		{
			title: "Search Phaseo models",
			description: "Search the live Phaseo model catalogue by name, provider, modality, minimum context length, or maximum input price. Read-only.",
			inputSchema: {
				query: z.string().max(200).optional(),
				provider: z.string().max(100).optional(),
				modality: z.enum(["text", "image", "audio", "video"]).optional(),
				minimumContextTokens: z.number().int().positive().optional(),
				maximumInputPricePerMillion: z.number().nonnegative().optional(),
				limit: z.number().int().min(1).max(MAX_RESULTS).default(10),
			},
			outputSchema: { models: z.array(z.object(modelSummarySchema)) },
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
			_meta: oauthToolMeta(["models:read", "pricing:read"]),
		},
		async ({ query, provider, modality, minimumContextTokens, maximumInputPricePerMillion, limit }) => {
			try {
				const queryTerms = normalise(query).split(/\s+/).filter(Boolean);
				const models = (await listModels(env, 250, { accessToken: authenticatedUser.accessToken })).filter((model) => {
					const searchable = normalise([model.id, model.name, model.description, model.organisation?.name].filter(Boolean).join(" "));
					const inputPrice = Number(model.pricing.prompt);
					return (
						queryTerms.every((term) => searchable.includes(term)) &&
						(!provider || normalise(model.organisation?.name).includes(normalise(provider))) &&
						(!modality || model.architecture.input_modalities.map(normalise).includes(modality)) &&
						(!minimumContextTokens || (model.context_length ?? model.top_provider?.context_length ?? 0) >= minimumContextTokens) &&
						(maximumInputPricePerMillion === undefined || (Number.isFinite(inputPrice) && inputPrice * 1_000_000 <= maximumInputPricePerMillion))
					);
				}).slice(0, limit);
				const result = models.map(modelSummary);
				return {
					content: [{ type: "text" as const, text: `Found ${result.length} matching Phaseo model${result.length === 1 ? "" : "s"}.` }],
					structuredContent: { models: result },
				};
			} catch (error) { return errorResult(error); }
		},
	);

	if (
		authenticatedUser.scopes.includes("models:read") &&
		authenticatedUser.scopes.includes("pricing:read")
	) server.registerTool(
		"model_get",
		{
			title: "Get a Phaseo model",
			description: "Get live pricing, capabilities, and provider availability for one Phaseo model ID. Read-only.",
			inputSchema: { modelId: z.string().min(1).max(200) },
			outputSchema: { model: z.object(modelSummarySchema) },
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
			_meta: oauthToolMeta(["models:read", "pricing:read"]),
		},
		async ({ modelId }) => {
			try {
				const model = await getModel(env, modelId, { accessToken: authenticatedUser.accessToken });
				if (!model) return { isError: true as const, content: [{ type: "text" as const, text: `No Phaseo model exists with ID "${modelId}".` }] };
				return { content: [{ type: "text" as const, text: `Retrieved ${model.name} from Phaseo.` }], structuredContent: { model: modelSummary(model) } };
			} catch (error) { return errorResult(error); }
		},
	);

	if (authenticatedUser.scopes.includes("pricing:read")) server.registerTool(
		"pricing_calculate",
		{
			title: "Calculate Phaseo provider pricing",
			description: "Calculate an exact price-card result for a provider, model, endpoint, and usage payload. This does not run inference or create a billable request.",
			inputSchema: {
				provider: z.string().min(1).max(100),
				model: z.string().min(1).max(200),
				endpoint: z.string().min(1).max(100),
				usage: z.record(z.string(), z.unknown()),
				requestStartedAt: z.string().datetime().optional(),
				providerAcceptedAt: z.string().datetime().optional(),
				completedAt: z.string().datetime().optional(),
			},
			outputSchema: { result: z.record(z.string(), z.unknown()) },
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
			_meta: oauthToolMeta(["pricing:read"]),
		},
		async ({ provider, model, endpoint, usage, requestStartedAt, providerAcceptedAt, completedAt }) => {
			try {
				const result = await requestPhaseo<Record<string, unknown>>(env, "/v1/pricing/calculate", {
					method: "POST",
					credentials: { accessToken: authenticatedUser.accessToken },
					body: {
						provider, model, endpoint, usage,
						request_started_at: requestStartedAt,
						provider_accepted_at: providerAcceptedAt,
						completed_at: completedAt,
					},
				});
				return {
					content: [{ type: "text" as const, text: "Calculated the current Phaseo price-card result." }],
					structuredContent: { result },
				};
			} catch (error) { return errorResult(error); }
		},
	);

	if (authenticatedUser.scopes.includes("providers:read")) server.registerTool(
		"providers_list",
		{
			title: "List Phaseo providers",
			description: "List AI providers currently available through Phaseo. Read-only.",
			inputSchema: {},
			outputSchema: { providers: z.array(z.object(providerSchema)) },
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
			_meta: oauthToolMeta(["providers:read"]),
		},
		async () => {
			try {
				const providers = (await listProviders(env, { accessToken: authenticatedUser.accessToken })).map(providerSummary);
				return { content: [{ type: "text" as const, text: `Phaseo currently lists ${providers.length} providers.` }], structuredContent: { providers } };
			} catch (error) { return errorResult(error); }
		},
	);

	if (
		authenticatedUser.scopes.includes("models:read") &&
		authenticatedUser.scopes.includes("pricing:read")
	) server.registerTool(
		"cost_estimate",
		{
			title: "Estimate a Phaseo model cost",
			description: "Estimate input, cached-input, and output token cost from Phaseo's current listed model pricing. This is an estimate, not a bill. Read-only.",
			inputSchema: {
				modelId: z.string().min(1).max(200),
				inputTokens: z.number().int().nonnegative(),
				cachedInputTokens: z.number().int().nonnegative().default(0),
				outputTokens: z.number().int().nonnegative(),
			},
			outputSchema: {
				estimate: z.object({
					modelId: z.string(),
					inputTokens: z.number().int(),
					cachedInputTokens: z.number().int(),
					outputTokens: z.number().int(),
					inputCostUSD: z.number(),
					cachedInputCostUSD: z.number(),
					outputCostUSD: z.number(),
					totalCostUSD: z.number(),
					currency: z.literal("USD"),
				}),
			},
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
			_meta: oauthToolMeta(["models:read", "pricing:read"]),
		},
		async ({ modelId, inputTokens, cachedInputTokens, outputTokens }) => {
			try {
				const model = await getModel(env, modelId, { accessToken: authenticatedUser.accessToken });
				if (!model) return { isError: true as const, content: [{ type: "text" as const, text: `No Phaseo model exists with ID "${modelId}".` }] };
				const inputRate = tokenRate(model.pricing.prompt);
				const cachedRate = tokenRate(model.pricing.input_cache_read);
				const outputRate = tokenRate(model.pricing.completion);
				if (inputRate === null || outputRate === null || (cachedInputTokens > 0 && cachedRate === null)) {
					return { isError: true as const, content: [{ type: "text" as const, text: `Phaseo does not currently expose enough token pricing to estimate ${modelId}.` }] };
				}
				const inputCostUSD = inputTokens * inputRate;
				const cachedInputCostUSD = cachedInputTokens * (cachedRate ?? 0);
				const outputCostUSD = outputTokens * outputRate;
				const totalCostUSD = inputCostUSD + cachedInputCostUSD + outputCostUSD;
				const estimate = { modelId, inputTokens, cachedInputTokens, outputTokens, inputCostUSD, cachedInputCostUSD, outputCostUSD, totalCostUSD, currency: "USD" as const };
				return { content: [{ type: "text" as const, text: `Estimated cost for ${model.name}: $${totalCostUSD.toFixed(6)} USD.` }], structuredContent: { estimate } };
			} catch (error) { return errorResult(error); }
		},
	);

	if (authenticatedUser.scopes.includes("keys:read")) server.registerTool(
		"api_keys_list",
		{
			title: "List Phaseo Gateway API keys",
			description:
				"List Gateway API keys in the authenticated Phaseo workspace, including their status, limits, and expiry. Does not return key secrets. Requires the keys:read permission.",
			inputSchema: {},
			outputSchema: { keys: z.array(z.object(apiKeySchema)) },
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
			_meta: oauthToolMeta(["keys:read"]),
		},
		async () => {
			try {
				const keys = (await listApiKeys(env, { accessToken: authenticatedUser.accessToken })).map(apiKeySummary);
				return {
					content: [{ type: "text" as const, text: `Found ${keys.length} Gateway API key${keys.length === 1 ? "" : "s"} in the authenticated Phaseo workspace.` }],
					structuredContent: { keys },
				};
			} catch (error) { return errorResult(error); }
		},
	);

	registerControlPlaneReadTools(server, env, authenticatedUser);

	registerMutationTools(server, env, authenticatedUser);

	return server;
}

function enabledMcpScopes(env: PhaseoEnv): string[] {
	return [
		...READ_ONLY_MCP_SCOPES,
		...(env.PHASEO_MCP_WRITE_TOOLS_ENABLED?.trim().toLowerCase() === "true" ? MCP_WRITE_SCOPES : []),
		...(env.PHASEO_MCP_WRITE_TOOLS_ENABLED?.trim().toLowerCase() === "true" &&
			env.PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED?.trim().toLowerCase() === "true" ? MCP_DELETE_SCOPES : []),
	];
}

function resourceMetadata(request: Request, env: PhaseoEnv): Response {
	const origin = new URL(request.url).origin;
	return Response.json({
		resource: `${origin}/mcp`,
		authorization_servers: [`${env.PHASEO_API_BASE_URL.replace(/\/+$/, "")}/oauth`],
		scopes_supported: enabledMcpScopes(env),
		bearer_methods_supported: ["header"],
	}, { headers: { "Cache-Control": "public, max-age=300" } });
}

function unauthorised(request: Request, env: PhaseoEnv): Response {
	const origin = new URL(request.url).origin;
	// This challenge is the minimum connection grant. Elevated scopes remain
	// discoverable in resource metadata but are never bundled into first login.
	const scopes = READ_ONLY_MCP_SCOPES;
	return new Response("Phaseo login is required.", {
		status: 401,
		headers: {
			"WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="${scopes.join(" ")}"`,
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

function secureResponse(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "no-referrer");
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
	async fetch(request: Request, env: PhaseoEnv, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/health") return secureResponse(Response.json({ status: "ok", service: "phaseo-mcp" }));
		if (url.pathname === "/.well-known/oauth-protected-resource/mcp") return secureResponse(resourceMetadata(request, env));
		if (url.pathname !== "/mcp") return secureResponse(new Response("Not found", { status: 404 }));
		if (url.searchParams.has("access_token")) return secureResponse(new Response("Bearer tokens must use the Authorization header.", { status: 400 }));
		const boundedRequest = await boundedMcpRequest(request);
		if (boundedRequest instanceof Response) return secureResponse(boundedRequest);
		const authenticatedUser = await authenticatePhaseoUser(boundedRequest, env);
		if (!authenticatedUser) return secureResponse(unauthorised(request, env));
		const response = await createMcpHandler(createServer(env, authenticatedUser), {
			route: "/mcp",
			authContext: { props: { workspaceId: authenticatedUser.workspaceId } },
		})(boundedRequest, env, ctx);
		return secureResponse(response);
	},
} satisfies ExportedHandler<PhaseoEnv>;

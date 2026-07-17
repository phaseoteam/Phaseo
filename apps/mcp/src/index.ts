import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	createApiKey,
	authenticatePhaseoUser,
	type AuthenticatedPhaseoUser,
	type Env,
	getModel,
	listApiKeys,
	listModels,
	listProviders,
	PhaseoApiError,
} from "./phaseo-api";

const MAX_RESULTS = 20;

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

function errorResult(error: unknown) {
	const message = error instanceof PhaseoApiError ? error.message : "Phaseo could not complete this request.";
	return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function createServer(env: Env, authenticatedUser?: AuthenticatedPhaseoUser): McpServer {
	const server = new McpServer({
		name: "Phaseo",
		version: "0.2.0",
		description:
			"Live Phaseo model catalogue, provider, pricing, and authenticated workspace controls. Use live Phaseo data rather than model-memory for current model or pricing questions. Write tools require explicit user confirmation.",
	});

	server.registerTool(
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
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
		},
		async ({ query, provider, modality, minimumContextTokens, maximumInputPricePerMillion, limit }) => {
			try {
				const queryTerms = normalise(query).split(/\s+/).filter(Boolean);
				const models = (await listModels(env, 250, { accessToken: authenticatedUser?.accessToken })).filter((model) => {
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

	server.registerTool(
		"model_get",
		{
			title: "Get a Phaseo model",
			description: "Get live pricing, capabilities, and provider availability for one Phaseo model ID. Read-only.",
			inputSchema: { modelId: z.string().min(1).max(200) },
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
		},
		async ({ modelId }) => {
			try {
				const model = await getModel(env, modelId, { accessToken: authenticatedUser?.accessToken });
				if (!model) return { isError: true as const, content: [{ type: "text" as const, text: `No Phaseo model exists with ID "${modelId}".` }] };
				return { content: [{ type: "text" as const, text: `Retrieved ${model.name} from Phaseo.` }], structuredContent: { model: modelSummary(model) } };
			} catch (error) { return errorResult(error); }
		},
	);

	server.registerTool(
		"providers_list",
		{
			title: "List Phaseo providers",
			description: "List AI providers currently available through Phaseo. Read-only.",
			inputSchema: {},
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
		},
		async () => {
			try {
				const providers = await listProviders(env, { accessToken: authenticatedUser?.accessToken });
				return { content: [{ type: "text" as const, text: `Phaseo currently lists ${providers.length} providers.` }], structuredContent: { providers } };
			} catch (error) { return errorResult(error); }
		},
	);

	server.registerTool(
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
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
		},
		async ({ modelId, inputTokens, cachedInputTokens, outputTokens }) => {
			try {
				const model = await getModel(env, modelId, { accessToken: authenticatedUser?.accessToken });
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

	if (!authenticatedUser) return server;

	server.registerTool(
		"api_keys_list",
		{
			title: "List Phaseo Gateway API keys",
			description:
				"List Gateway API keys in the authenticated Phaseo workspace, including their status, limits, and expiry. Does not return key secrets. Requires the keys:read permission.",
			inputSchema: {},
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		async () => {
			try {
				const keys = await listApiKeys(env, { accessToken: authenticatedUser.accessToken });
				return {
					content: [{ type: "text" as const, text: `Found ${keys.length} Gateway API key${keys.length === 1 ? "" : "s"} in the authenticated Phaseo workspace.` }],
					structuredContent: { keys },
				};
			} catch (error) { return errorResult(error); }
		},
	);

	server.registerTool(
		"api_key_create",
		{
			title: "Create a Phaseo Gateway API key",
			description:
				"Create a new Gateway API key in the authenticated Phaseo workspace. This is a write operation and returns a secret exactly once. Call only after the user explicitly confirms the exact key name, limit, expiry, and that the secret may be displayed in this conversation. Requires the keys:write permission and workspace owner or admin role.",
			inputSchema: {
				name: z.string().min(1).max(100).describe("Human-readable key name confirmed by the user."),
				monthlyLimitUSD: z.number().nonnegative().nullable().optional().describe("Optional monthly USD spend limit. Use null for no limit."),
				expiresAt: z.string().datetime().nullable().optional().describe("Optional ISO-8601 expiry timestamp. Use null for no expiry."),
				confirm: z.literal(true).describe("Must be true only after the user explicitly confirmed creation and one-time secret display."),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async ({ name, monthlyLimitUSD, expiresAt }) => {
			try {
				const key = await createApiKey(env, { accessToken: authenticatedUser.accessToken }, {
					name,
					...(monthlyLimitUSD === undefined ? {} : { limit: monthlyLimitUSD, limit_reset: "monthly" as const }),
					...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
				});
				return {
					content: [{ type: "text" as const, text: `Created Gateway API key "${key.name ?? name}". Its secret is shown once below; save it securely because Phaseo cannot retrieve it again.` }],
					structuredContent: { key },
				};
			} catch (error) { return errorResult(error); }
		},
	);

	return server;
}

function resourceMetadata(request: Request, env: Env): Response {
	const origin = new URL(request.url).origin;
	return Response.json({
		resource: `${origin}/mcp`,
		authorization_servers: [`${env.PHASEO_API_BASE_URL.replace(/\/+$/, "")}/oauth`],
		scopes_supported: [
			"openid",
			"profile",
			"email",
			"gateway:access",
			"me:read",
			"models:read",
			"providers:read",
			"pricing:read",
			"workspaces:read",
			"keys:read",
			"keys:write",
		],
		bearer_methods_supported: ["header"],
	}, { headers: { "Cache-Control": "public, max-age=300" } });
}

function unauthorised(request: Request): Response {
	const origin = new URL(request.url).origin;
	return new Response("Phaseo login is required.", {
		status: 401,
		headers: {
			"WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="openid gateway:access me:read models:read providers:read pricing:read workspaces:read keys:read keys:write"`,
			"Cache-Control": "no-store",
		},
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/health") return Response.json({ status: "ok", service: "phaseo-mcp", mode: "oauth-preview" });
		if (url.pathname === "/.well-known/oauth-protected-resource/mcp") return resourceMetadata(request, env);
		if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
		const authenticatedUser = await authenticatePhaseoUser(request, env);
		if (!authenticatedUser) return unauthorised(request);
		return createMcpHandler(createServer(env, authenticatedUser), {
			route: "/mcp",
			authContext: { props: { workspaceId: authenticatedUser.workspaceId } },
		})(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

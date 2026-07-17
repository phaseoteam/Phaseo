export type PhaseoEnv = Cloudflare.Env & {
	PHASEO_MCP_RESOURCE_SERVER_SECRET: string;
	PHASEO_MCP_WRITE_TOOLS_ENABLED?: string;
	PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED?: string;
	PHASEO_MCP_SECRET_TOOLS_ENABLED?: string;
};

export type GatewayMeter = {
	meter: string;
	unit: string;
	unit_size: number;
	price_per_unit: string;
	currency: string;
};

export type GatewayModel = {
	id: string;
	name: string;
	description: string | null;
	organisation: { id: string; name: string | null } | null;
	architecture: { input_modalities: string[]; output_modalities: string[] };
	context_length: number | null;
	top_provider: { context_length: number | null; max_completion_tokens: number | null } | null;
	supported_parameters: string[];
	pricing: Record<string, string | null>;
	providers: Array<{
		api_provider_id: string;
		api_provider_name: string | null;
		supported_parameters: string[];
	}>;
	pricing_details?: { meters?: Record<string, GatewayMeter> };
};

type ModelsResponse = { ok: boolean; models?: GatewayModel[]; message?: string };
type ProvidersResponse = {
	ok: boolean;
	providers?: Array<{
		api_provider_id: string;
		api_provider_name: string | null;
		description: string | null;
		link: string | null;
		country_code: string | null;
	}>;
	message?: string;
};

export class PhaseoApiError extends Error {}

function apiUrl(env: PhaseoEnv, path: string, query: Record<string, string | number | boolean | undefined> = {}): URL {
	const url = new URL(path, env.PHASEO_API_BASE_URL.endsWith("/") ? env.PHASEO_API_BASE_URL : `${env.PHASEO_API_BASE_URL}/`);
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) url.searchParams.set(key, String(value));
	}
	return url;
}

export type PhaseoCredentials = {
	accessToken?: string;
};

export type AuthenticatedPhaseoUser = {
	accessToken: string;
	workspaceId: string | null;
	scopes: string[];
};

function resolveAccessToken(credentials: PhaseoCredentials = {}): string {
	const token = credentials.accessToken?.trim();
	if (!token) throw new PhaseoApiError("Phaseo authentication is required.");
	return token;
}

export async function requestPhaseo<T>(
	env: PhaseoEnv,
	path: string,
	options: {
		credentials?: PhaseoCredentials;
		method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
		query?: Record<string, string | number | boolean | undefined>;
		body?: unknown;
	} = {},
): Promise<T> {
	const token = resolveAccessToken(options.credentials);
	const request = new Request(apiUrl(env, path, options.query), {
		method: options.method ?? "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const response = env.PHASEO_API ? await env.PHASEO_API.fetch(request) : await fetch(request);
	const payload = (await response.json().catch(() => null)) as T | null;
	if (!response.ok || !payload) {
		const details = payload && typeof payload === "object"
			? String((payload as Record<string, unknown>).message ?? (payload as Record<string, unknown>).error ?? "").trim()
			: "";
		throw new PhaseoApiError(details || `Phaseo API request failed (${response.status}).`);
	}
	return payload;
}

export async function readControlPlane(
	env: PhaseoEnv,
	path: string,
	credentials: PhaseoCredentials,
	query: Record<string, string | number | boolean | undefined> = {},
): Promise<Record<string, unknown>> {
	return requestPhaseo<Record<string, unknown>>(env, path, { credentials, query });
}

export async function listModels(env: PhaseoEnv, limit = 250, credentials?: PhaseoCredentials): Promise<GatewayModel[]> {
	const payload = await requestPhaseo<ModelsResponse>(env, "/v1/models", { query: { limit }, credentials });
	if (!payload.ok || !payload.models) throw new PhaseoApiError(payload.message ?? "Phaseo could not load models.");
	return payload.models;
}

export async function getModel(env: PhaseoEnv, modelId: string, credentials?: PhaseoCredentials): Promise<GatewayModel | null> {
	const payload = await requestPhaseo<ModelsResponse>(env, "/v1/models", { query: { id: modelId, limit: 1 }, credentials });
	if (!payload.ok) throw new PhaseoApiError(payload.message ?? "Phaseo could not load the model.");
	return payload.models?.[0] ?? null;
}

export async function listProviders(env: PhaseoEnv, credentials?: PhaseoCredentials): Promise<NonNullable<ProvidersResponse["providers"]>> {
	const payload = await requestPhaseo<ProvidersResponse>(env, "/v1/providers", { query: { limit: 250 }, credentials });
	if (!payload.ok || !payload.providers) throw new PhaseoApiError(payload.message ?? "Phaseo could not load providers.");
	return payload.providers;
}

export type PhaseoApiKey = {
	id: string;
	name: string | null;
	prefix: string | null;
	status: string | null;
	created_at: string | null;
	last_used_at: string | null;
	expires_at: string | null;
	disabled: boolean;
	limit: number | null;
	limit_reset: "daily" | "weekly" | "monthly" | null;
};

type KeysResponse = { data?: PhaseoApiKey[]; total_count?: number; error?: string; message?: string };
type CreateKeyResponse = { data?: PhaseoApiKey & { key?: string }; error?: string; message?: string };

export async function listApiKeys(env: PhaseoEnv, credentials: PhaseoCredentials): Promise<PhaseoApiKey[]> {
	const payload = await requestPhaseo<KeysResponse>(env, "/v1/keys", { credentials, query: { limit: 100, include_disabled: 1 } });
	if (!payload.data) throw new PhaseoApiError(payload.message ?? payload.error ?? "Phaseo could not load API keys.");
	return payload.data;
}

export async function createApiKey(
	env: PhaseoEnv,
	credentials: PhaseoCredentials,
	input: { name: string; limit?: number | null; limit_reset?: "daily" | "weekly" | "monthly"; expires_at?: string | null },
): Promise<PhaseoApiKey & { key: string }> {
	const payload = await requestPhaseo<CreateKeyResponse>(env, "/v1/keys", { method: "POST", credentials, body: input });
	if (!payload.data?.key) throw new PhaseoApiError(payload.message ?? payload.error ?? "Phaseo could not create the API key.");
	return payload.data as PhaseoApiKey & { key: string };
}

export async function authenticatePhaseoUser(request: Request, env: PhaseoEnv): Promise<AuthenticatedPhaseoUser | null> {
	const authorization = request.headers.get("authorization") ?? "";
	if (!authorization.toLowerCase().startsWith("bearer ")) return null;
	const accessToken = authorization.slice(7).trim();
	if (!accessToken) return null;
	const resource = `${new URL(request.url).origin}/mcp`;
	const resourceServerSecret = env.PHASEO_MCP_RESOURCE_SERVER_SECRET?.trim();
	if (!resourceServerSecret || resourceServerSecret.length < 64) return null;

	try {
		const exchangeRequest = new Request(apiUrl(env, "/oauth/mcp/token-exchange"), {
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`phaseo_mcp_resource_server:${resourceServerSecret}`)}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ subject_token: accessToken, resource }),
		});
		const response = env.PHASEO_API
			? await env.PHASEO_API.fetch(exchangeRequest)
			: await fetch(exchangeRequest);
		const exchange = await response.json<{
			active?: boolean;
			resource?: string;
			workspace_id?: string | null;
			scope?: string;
			upstream_access_token?: string;
		}>().catch(() => null);
		if (
			!response.ok ||
			!exchange?.active ||
			exchange.resource !== resource ||
			!exchange.upstream_access_token
		) return null;
		return {
			accessToken: exchange.upstream_access_token,
			workspaceId: exchange.workspace_id ?? null,
			scopes: exchange.scope?.split(/\s+/).filter(Boolean) ?? [],
		};
	} catch {
		return null;
	}
}

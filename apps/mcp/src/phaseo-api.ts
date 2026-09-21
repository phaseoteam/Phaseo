export type PhaseoEnv = Cloudflare.Env & {
	PHASEO_MCP_RESOURCE_SERVER_SECRET: string;
	OPENAI_APPS_CHALLENGE_TOKEN?: string;
	PHASEO_WEB_BASE_URL: string;
};

export type GatewayMeter = {
	unit: string;
	unit_size: number;
	price_per_unit: string;
	currency: string | null;
	provider_id: string;
};

export type GatewayModel = {
	id: string;
	name: string;
	description: string | null;
	organization: { id: string; name: string | null; color: string | null } | null;
	modalities: { input: string[]; output: string[] };
	limits: { input_tokens: number | null; output_tokens: number | null };
	capabilities: {
		endpoints: string[];
		parameters: string[];
		parameter_details: Record<string, Record<string, unknown>>;
	};
	availability: {
		status: "active" | "coming_soon" | "inactive" | "not_listed";
		provider_count: number;
		active_provider_count: number;
		coming_soon_provider_count: number;
		inactive_provider_count: number;
	};
	pricing: { pricing_plan: "standard"; meters: Record<string, GatewayMeter | null> };
	offers: Array<{
		provider: { id: string; name: string | null };
		model: string | null;
		status: "active" | "coming_soon" | "inactive";
		routable: boolean;
		capabilities: { parameters: string[]; parameter_details: Record<string, Record<string, unknown>> };
		pricing: { pricing_plan: "standard"; meters: Record<string, GatewayMeter | null> };
	}>;
};

type ModelsResponse = {
	ok: boolean;
	models?: GatewayModel[];
	message?: string;
	total?: number;
	limit?: number;
	offset?: number;
};
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

export type BenchmarkRanking = {
	benchmark_id: string;
	name: string;
	category: string | null;
	benchmark_type: string | null;
	lower_is_better: boolean;
	total_models: number | null;
	entries: Array<{
		model_id: string;
		model_name: string;
		organisation_id: string | null;
		organisation_name: string | null;
		score: number;
		rank: number;
		source_link: string | null;
		updated_at: string | null;
	}>;
};

type BenchmarkRankingsResponse = { benchmarks?: BenchmarkRanking[]; error?: string };

export class PhaseoApiError extends Error {
	constructor(message: string, readonly status?: number) {
		super(message);
		this.name = "PhaseoApiError";
	}
}

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
		// Backend and database error strings are not part of the public MCP
		// contract. Preserve useful validation errors, but redact all 5xx detail.
		const message = response.status >= 500
			? `Phaseo could not complete the request (${response.status}).`
			: details || `Phaseo API request failed (${response.status}).`;
		throw new PhaseoApiError(message, response.status);
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

export async function listAllModels(env: PhaseoEnv, credentials?: PhaseoCredentials): Promise<GatewayModel[]> {
	const pageSize = 250;
	const models: GatewayModel[] = [];
	const seen = new Set<string>();
	let offset = 0;

	while (true) {
		const payload = await requestPhaseo<ModelsResponse>(env, "/v1/models", {
			query: { limit: pageSize, offset },
			credentials,
		});
		if (!payload.ok || !payload.models) throw new PhaseoApiError(payload.message ?? "Phaseo could not load models.");

		let added = 0;
		for (const model of payload.models) {
			if (seen.has(model.id)) continue;
			seen.add(model.id);
			models.push(model);
			added += 1;
		}

		offset += payload.models.length;
		if (
			payload.models.length < pageSize ||
			(typeof payload.total === "number" && offset >= payload.total) ||
			added === 0
		) break;
	}

	return models;
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

export async function listBenchmarkRankings(env: PhaseoEnv): Promise<BenchmarkRanking[]> {
	const baseUrl = env.PHASEO_WEB_BASE_URL?.trim();
	if (!baseUrl) throw new PhaseoApiError("Phaseo benchmark rankings are not configured.");
	const url = new URL(
		"/api/_web/rankings/benchmarks",
		baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
	);
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(10_000),
		});
	} catch {
		throw new PhaseoApiError("Phaseo benchmark rankings are temporarily unavailable.");
	}
	const payload = await response.json<BenchmarkRankingsResponse>().catch(() => null);
	if (!response.ok || !payload?.benchmarks) {
		throw new PhaseoApiError(
			response.status >= 500
				? `Phaseo could not load benchmark rankings (${response.status}).`
				: payload?.error || `Phaseo benchmark request failed (${response.status}).`,
			response.status,
		);
	}
	return payload.benchmarks;
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

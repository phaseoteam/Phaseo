import { Hono } from "hono";
import { Phaseo } from "@phaseo/sdk";
import {
	proxyGateway,
	resolveGatewayBaseUrlForEnvironment,
	resolveGatewayKeys,
	CANONICAL_CHAT_APP_HEADERS,
	sanitizeAppHeaders,
	type ChatProxyEnvelope,
} from "@/chat/proxy";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";

type AudioAction = "speech" | "transcription" | "translation" | "music";
const AUDIO_PATHS: Record<AudioAction, string> = { speech: "/audio/speech", transcription: "/audio/transcriptions", translation: "/audio/translations", music: "/music/generations" };
const POST_PATHS = { text: "/responses", playground: "/responses", "chat-completions": "/chat/completions", messages: "/messages", embeddings: "/embeddings", image: "/images/generations", moderation: "/moderations" } as const;
export const chatRouter = new Hono<{ Bindings: Env }>();

const waitUntil = (c: any) => (promise: Promise<unknown>) => c.executionCtx.waitUntil(promise);

function truthy(value: string | undefined): boolean { return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase()); }
function videoEnabled(env: Env): boolean { const value = env.VIDEO_CHAT_API_ENABLED ?? env.NEXT_PUBLIC_VIDEO_CHAT_API_ENABLED; return value == null || !["0", "false", "no", "off"].includes(value.trim().toLowerCase()); }
function unavailable(c: any) { return c.json({ error: "Video generation is coming soon.", code: "not_implemented_yet" }, 501, PRIVATE_NO_STORE_HEADERS); }
async function envelope(request: Request): Promise<ChatProxyEnvelope & Record<string, any>> { return request.json().catch(() => ({})); }

async function isInternalAdmin(request: Request, env: Env): Promise<boolean> {
	const user = await requireUser(request, env);
	if (!user) return false;
	const role = await getDataClient(env).from("users").select("role").eq("user_id", user.id).maybeSingle();
	return !role.error && String(role.data?.role ?? "").toLowerCase() === "admin";
}

function realtimeError(status: number, error: string, message: string): Response {
	return new Response(JSON.stringify({ error, message }), {
		status,
		headers: { "Content-Type": "application/json", ...PRIVATE_NO_STORE_HEADERS },
	});
}

function realtimeWebSocketUrl(baseUrl: string, path: string): string {
	const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
	const url = path.startsWith("/") ? new URL(path, base.origin) : new URL(path, base);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
}

function normalizeRealtimeProvider(value: string): "openai" | "spacex-ai" | "google-ai-studio" | null {
	if (value === "openai") return "openai";
	if (value === "xai" || value === "x-ai" || value === "spacex-ai") return "spacex-ai";
	if (value === "google" || value === "google-ai-studio") return "google-ai-studio";
	return null;
}

function normalizeRealtimeModel(provider: string, model: string): string {
	if (provider === "spacex-ai") return model.includes("/") ? model.replace(/^(xai|x-ai)\//, "spacex-ai/") : `spacex-ai/${model}`;
	if (model.includes("/")) return model;
	if (provider === "openai") return `openai/${model}`;
	if (provider === "x-ai") return `x-ai/${model}`;
	return `google/${model}`;
}

for (const [route, path] of Object.entries(POST_PATHS)) {
	chatRouter.post(`/${route}`, async (c) => {
		const body = await envelope(c.req.raw);
		return proxyGateway(c.req.raw, c.env, waitUntil(c), { path, requestBody: body.requestBody ?? {}, appHeaders: body.appHeaders, debug: body.debug, stream: (route === "text" || route === "playground") && body.requestBody?.stream === true, baseUrl: body.baseUrl });
	});
}

chatRouter.post("/sdk-test", async (c) => {
	const body = await envelope(c.req.raw);
	const endpoint = String(body.endpoint ?? "responses");
	if (!["responses", "chat_completions", "messages", "images", "video", "speech", "transcription", "translation", "music", "embeddings", "moderation"].includes(endpoint)) {
		return c.json({ error: "unsupported_sdk_test_endpoint", message: "This SDK test endpoint is not supported." }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (!await isInternalAdmin(c.req.raw, c.env)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (endpoint === "video" && !videoEnabled(c.env)) return unavailable(c);
	const auth = await resolveGatewayKeys(c.req.raw, c.env, waitUntil(c));
	if (!("apiKey" in auth)) return realtimeError(auth.status, auth.code, auth.message);
	const baseUrl = resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: c.env.AI_STATS_GATEWAY_URL ?? c.env.PHASEO_GATEWAY_URL, stagingBaseUrl: c.env.STAGING_GATEWAY_BASE_URL, requestedBaseUrl: body.baseUrl, environment: c.env.ENV });
	if (!baseUrl) return realtimeError(500, "gateway_not_configured", "Missing gateway URL.");

	let captured: { status: number; statusText: string; headers: Record<string, string> } | null = null;
	const capturingFetch: typeof fetch = async (input, init) => {
		const response = await fetch(input, init);
		captured = { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()) };
		return response;
	};
	const client = new Phaseo({ apiKey: auth.apiKey, baseUrl, fetchImpl: capturingFetch, app: { id: "phaseo-app", name: "Phaseo", url: "https://phaseo.app" }, headers: { "x-gateway-debug": "true" } });
	try {
		const requestBody = body.requestBody ?? {};
		const result = endpoint === "responses" ? await client.responses.create(requestBody as any)
			: endpoint === "chat_completions" ? await client.chat.completions.create(requestBody as any)
			: endpoint === "messages" ? await client.messages.create(requestBody as any)
			: endpoint === "images" ? await client.generateImage(requestBody as any)
			: endpoint === "video" ? await client.generateVideo(requestBody as any)
			: endpoint === "speech" ? await client.generateSpeech(requestBody as any)
			: endpoint === "transcription" ? await client.generateTranscription(requestBody as any)
			: endpoint === "translation" ? await client.generateTranslation(requestBody as any)
			: endpoint === "music" ? await client.music.create(requestBody as any)
			: endpoint === "embeddings" ? await client.generateEmbedding(requestBody as any)
			: await client.generateModeration(requestBody as any);
		return c.json({ sdk: "@phaseo/sdk", endpoint, result, upstream: captured }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		const source = error as { message?: string; status?: number; body?: unknown; response?: unknown };
		return c.json({ error: "sdk_request_failed", message: source.message ?? "SDK request failed", sdk: "@phaseo/sdk", endpoint, upstream: captured, details: source.body ?? source.response ?? null }, (source.status && source.status >= 400 && source.status <= 599 ? source.status : captured?.status ?? 500) as any, PRIVATE_NO_STORE_HEADERS);
	}
});

chatRouter.post("/audio", async (c) => {
	const body = await envelope(c.req.raw);
	const action: AudioAction = Object.hasOwn(AUDIO_PATHS, body.action) ? body.action : "speech";
	return proxyGateway(c.req.raw, c.env, waitUntil(c), { path: AUDIO_PATHS[action], requestBody: body.requestBody ?? {}, appHeaders: body.appHeaders, debug: body.debug, baseUrl: body.baseUrl });
});

chatRouter.get("/realtime/session/:sessionId", async (c) => {
	const auth = await resolveGatewayKeys(c.req.raw, c.env, waitUntil(c));
	if ("status" in auth) return realtimeError(auth.status, auth.code, auth.message);
	const sessionId = c.req.param("sessionId");
	if (!/^rt_[0-9a-hjkmnp-tv-z]{26}$/.test(sessionId)) return realtimeError(400, "invalid_session_id", "Invalid realtime session.");
	const result = await getDataClient(c.env).from("gateway_realtime_sessions")
		.select("session_id,status,reserved_nanos,captured_nanos,released_nanos,estimated_cost_nanos,final_cost_nanos,currency")
		.eq("session_id", sessionId).eq("workspace_id", auth.workspaceId).eq("user_id", auth.userId).eq("source", "chat").maybeSingle();
	if (result.error) return realtimeError(503, "realtime_status_unavailable", "Realtime billing is temporarily unavailable.");
	if (!result.data) return realtimeError(404, "realtime_session_not_found", "Realtime session not found.");
	return c.json(result.data, 200, PRIVATE_NO_STORE_HEADERS);
});

chatRouter.post("/realtime/session", async (c) => {
	const auth = await resolveGatewayKeys(c.req.raw, c.env, waitUntil(c));
	if (!("apiKey" in auth)) return realtimeError(auth.status, auth.code, auth.message);

	const body = await envelope(c.req.raw);
	const provider = normalizeRealtimeProvider(String(body.provider ?? "").trim().toLowerCase());
	const model = String(body.model ?? "").trim();
	const voice = typeof body.voice === "string" ? body.voice.trim() : "";
	const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
	if (!provider || !model || model.length > 160 || voice.length > 80 || instructions.length > 4000) {
		return realtimeError(400, "invalid_realtime_session_request", "Invalid realtime session request.");
	}

	const baseUrl = resolveGatewayBaseUrlForEnvironment({
		configuredBaseUrl: c.env.AI_STATS_GATEWAY_URL ?? c.env.PHASEO_GATEWAY_URL,
		stagingBaseUrl: c.env.STAGING_GATEWAY_BASE_URL,
		environment: c.env.ENV,
	});
	if (!baseUrl) return realtimeError(500, "gateway_not_configured", "Realtime gateway is not configured.");

	let upstream: Response;
	try {
		upstream = await fetch(`${baseUrl}/realtime/sessions`, {
			method: "POST",
			headers: {
				...CANONICAL_CHAT_APP_HEADERS,
				...sanitizeAppHeaders(body.appHeaders),
				Authorization: `Bearer ${auth.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				provider,
				model: normalizeRealtimeModel(provider, model),
				...(voice ? { voice } : {}),
				...(instructions ? { instructions } : {}),
				source: "chat",
				metadata: { feature: "chat_realtime_voice", userId: auth.userId, workspaceId: auth.workspaceId },
			}),
		});
	} catch {
		return realtimeError(502, "gateway_unreachable", "The realtime gateway is temporarily unavailable.");
	}

	const payload = await upstream.json<Record<string, any>>().catch(() => null);
	if (!upstream.ok || !payload) {
		return new Response(JSON.stringify(payload ?? { error: "realtime_session_failed" }), {
			status: upstream.status,
			headers: { "Content-Type": "application/json", ...PRIVATE_NO_STORE_HEADERS },
		});
	}
	const connect = payload.connect as Record<string, unknown> | undefined;
	const clientSecret = String(payload.clientSecret ?? "");
	if (!connect?.url || !String(connect.url).includes("/relay") || !clientSecret) {
		return realtimeError(502, "invalid_realtime_relay_response", "The realtime gateway did not return a valid relay session.");
	}
	return c.json({
		...payload,
		provider: provider === "spacex-ai" ? "xai" : provider === "google-ai-studio" ? "google" : provider,
		connect: {
			...connect,
			transport: "websocket",
			url: realtimeWebSocketUrl(baseUrl, String(connect.url)),
			protocols: ["statsync-realtime", `rtsec.${clientSecret}`],
		},
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

chatRouter.get("/audio", async (c) => {
	if ((c.req.query("action") ?? "music") !== "music") return c.json({ error: "Polling is only supported for music action." }, 400, PRIVATE_NO_STORE_HEADERS);
	const resourceId = (c.req.query("resourceId") ?? c.req.query("musicId") ?? "").trim();
	if (!resourceId) return c.json({ error: "Missing resourceId for music polling." }, 400, PRIVATE_NO_STORE_HEADERS);
	return proxyGateway(c.req.raw, c.env, waitUntil(c), { method: "GET", path: `/music/generations/${encodeURIComponent(resourceId)}`, debug: c.req.query("debug") === "1" });
});

function videoPollPath(resourceId: string, content: boolean) { return `/videos/${encodeURIComponent(resourceId)}${content ? "/content" : ""}`; }
chatRouter.get("/video", async (c) => {
	if (!videoEnabled(c.env)) return unavailable(c);
	if (truthy(c.req.query("list"))) {
		const rawLimit = Number(c.req.query("limit")); const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 50;
		const statuses = (c.req.queries("status") ?? []).flatMap((value) => value.split(",")).map((value) => value.trim().toLowerCase()).map((value) => value === "pending" ? "queued" : ["processing", "running"].includes(value) ? "in_progress" : ["complete", "succeeded", "success"].includes(value) ? "completed" : ["error", "cancelled", "canceled"].includes(value) ? "failed" : value).filter((value) => ["queued", "in_progress", "completed", "failed"].includes(value));
		const query = new URLSearchParams({ limit: String(limit) }); for (const status of new Set(statuses)) query.append("status", status);
		return proxyGateway(c.req.raw, c.env, waitUntil(c), { method: "GET", path: `/videos?${query}` });
	}
	const resourceId = (c.req.query("resourceId") ?? "").trim();
	if (!resourceId) return c.json({ error: "Missing resourceId query parameter." }, 400, PRIVATE_NO_STORE_HEADERS);
	return proxyGateway(c.req.raw, c.env, waitUntil(c), { method: "GET", path: videoPollPath(resourceId, truthy(c.req.query("content"))) });
});

chatRouter.post("/video", async (c) => {
	if (!videoEnabled(c.env)) return unavailable(c);
	const body = await envelope(c.req.raw);
	if (body.poll) {
		const resourceId = String(body.poll.resourceId ?? "").trim();
		if (!resourceId) return c.json({ error: "Missing poll.resourceId." }, 400, PRIVATE_NO_STORE_HEADERS);
		return proxyGateway(c.req.raw, c.env, waitUntil(c), { method: "GET", path: videoPollPath(resourceId, Boolean(body.poll.content)), appHeaders: body.appHeaders, debug: body.debug, baseUrl: body.baseUrl });
	}
	return proxyGateway(c.req.raw, c.env, waitUntil(c), { path: "/videos", requestBody: body.requestBody ?? {}, appHeaders: body.appHeaders, debug: body.debug, baseUrl: body.baseUrl });
});

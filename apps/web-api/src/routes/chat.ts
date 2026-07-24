import { Hono } from "hono";
import {
	proxyGateway,
	resolveGatewayBaseUrlForEnvironment,
	resolveGatewayKeys,
	type ChatProxyEnvelope,
} from "@/chat/proxy";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

type AudioAction = "speech" | "transcription" | "translation" | "music";
const AUDIO_PATHS: Record<AudioAction, string> = { speech: "/audio/speech", transcription: "/audio/transcriptions", translation: "/audio/translations", music: "/music/generations" };
const POST_PATHS = { text: "/responses", playground: "/responses", embeddings: "/embeddings", image: "/images/generations", moderation: "/moderations" } as const;
export const chatRouter = new Hono<{ Bindings: Env }>();

const waitUntil = (c: any) => (promise: Promise<unknown>) => c.executionCtx.waitUntil(promise);

function truthy(value: string | undefined): boolean { return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase()); }
function videoEnabled(env: Env): boolean { const value = env.VIDEO_CHAT_API_ENABLED ?? env.NEXT_PUBLIC_VIDEO_CHAT_API_ENABLED; return value == null || !["0", "false", "no", "off"].includes(value.trim().toLowerCase()); }
function unavailable(c: any) { return c.json({ error: "Video generation is coming soon.", code: "not_implemented_yet" }, 501, PRIVATE_NO_STORE_HEADERS); }
async function envelope(request: Request): Promise<ChatProxyEnvelope & Record<string, any>> { return request.json().catch(() => ({})); }

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

function normalizeRealtimeProvider(value: string): "openai" | "x-ai" | "google-ai-studio" | null {
	if (value === "openai") return "openai";
	if (value === "xai" || value === "x-ai") return "x-ai";
	if (value === "google" || value === "google-ai-studio") return "google-ai-studio";
	return null;
}

function normalizeRealtimeModel(provider: string, model: string): string {
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

chatRouter.post("/audio", async (c) => {
	const body = await envelope(c.req.raw);
	const action: AudioAction = Object.hasOwn(AUDIO_PATHS, body.action) ? body.action : "speech";
	return proxyGateway(c.req.raw, c.env, waitUntil(c), { path: AUDIO_PATHS[action], requestBody: body.requestBody ?? {}, appHeaders: body.appHeaders, debug: body.debug, baseUrl: body.baseUrl });
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
		environment: c.env.ENV,
	});
	if (!baseUrl) return realtimeError(500, "gateway_not_configured", "Realtime gateway is not configured.");

	let upstream: Response;
	try {
		upstream = await fetch(`${baseUrl}/realtime/sessions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${auth.apiKey}`,
				"Content-Type": "application/json",
				"x-app-id": "phaseo-chat",
				"x-app-name": "Phaseo Chat",
				"x-title": "Phaseo Chat",
				"http-referer": "https://phaseo.app/chat",
			},
			body: JSON.stringify({
				provider,
				model: normalizeRealtimeModel(provider, model),
				...(voice ? { voice } : {}),
				...(instructions ? { instructions } : {}),
				source: "chat",
				relay: true,
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
		provider: provider === "x-ai" ? "xai" : provider === "google-ai-studio" ? "google" : provider,
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

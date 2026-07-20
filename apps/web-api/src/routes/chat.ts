import { Hono } from "hono";
import { proxyGateway, type ChatProxyEnvelope } from "@/chat/proxy";
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

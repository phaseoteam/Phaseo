import { Hono } from "hono";
import type { Env } from "@/env";
import { getDataClient } from "@/data/supabase";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { readLimitedText } from "@/http/readLimitedText";
import {
	decryptProviderCatalogWebhookSecret,
	syncProviderCatalog,
	verifyProviderCatalogWebhookSignature,
} from "./account/provider-catalog-sync";
import { providerCatalogJsonSchema } from "./account/provider-catalog";

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const PROVIDER_SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const EVENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;

export const providerCatalogWebhookRouter = new Hono<{ Bindings: Env }>();

providerCatalogWebhookRouter.get("/provider-catalog/schema", (c) => c.json(providerCatalogJsonSchema, 200, { "cache-control": "public, max-age=3600" }));

providerCatalogWebhookRouter.get("/provider-catalog/openapi", (c) => c.json({
	openapi: "3.1.0",
	info: { title: "Phaseo provider catalog webhook", version: "1.0.0" },
	paths: {
		"/api/internal/provider-catalog/{providerSlug}": {
			post: {
				summary: "Notify Phaseo that a provider catalog changed",
				parameters: [{ name: "providerSlug", in: "path", required: true, schema: { type: "string" } }, { name: "x-phaseo-timestamp", in: "header", required: true, schema: { type: "string" } }, { name: "x-phaseo-signature", in: "header", required: true, schema: { type: "string", description: "v1=<hex HMAC-SHA256 of timestamp.rawBody>" } }, { name: "x-phaseo-event-id", in: "header", required: true, schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["event_id"], properties: { event_id: { type: "string" } } } } } },
				responses: { "202": { description: "Catalog refresh accepted" }, "401": { description: "Invalid signature" } },
			},
		},
	},
}, 200, { "cache-control": "public, max-age=3600" }));

providerCatalogWebhookRouter.post("/provider-catalog/:providerSlug", async (c) => {
	const providerSlug = c.req.param("providerSlug").trim().toLowerCase();
	if (!PROVIDER_SLUG.test(providerSlug)) return c.json({ error: "invalid_provider_slug" }, 400, PRIVATE_NO_STORE_HEADERS);
	if (!c.req.header("x-phaseo-timestamp") || !c.req.header("x-phaseo-signature")) return c.json({ error: "invalid_signature" }, 401, PRIVATE_NO_STORE_HEADERS);
	const declaredLength = Number(c.req.header("content-length") ?? 0);
	if (declaredLength > MAX_WEBHOOK_BODY_BYTES) return c.json({ error: "payload_too_large" }, 413, PRIVATE_NO_STORE_HEADERS);
	let body: string;
	try { body = await readLimitedText(c.req.raw, MAX_WEBHOOK_BODY_BYTES); }
	catch { return c.json({ error: "payload_too_large" }, 413, PRIVATE_NO_STORE_HEADERS); }

	const client = getDataClient(c.env);
	const sourceResult = await client.from("provider_catalog_sources").select("provider_slug,status,webhook_secret_ciphertext,webhook_secret_iv,webhook_secret_hash").eq("provider_slug", providerSlug).maybeSingle();
	if (sourceResult.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!sourceResult.data) return c.json({ error: "invalid_signature" }, 401, PRIVATE_NO_STORE_HEADERS);

	let secret: string;
	try {
		secret = await decryptProviderCatalogWebhookSecret(c.env, sourceResult.data);
	} catch {
		return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	if (!await verifyProviderCatalogWebhookSignature({ secret, timestamp: c.req.header("x-phaseo-timestamp"), signature: c.req.header("x-phaseo-signature"), body })) {
		return c.json({ error: "invalid_signature" }, 401, PRIVATE_NO_STORE_HEADERS);
	}
	if (String(sourceResult.data.status) !== "active") return c.json({ error: "provider_sync_paused" }, 409, PRIVATE_NO_STORE_HEADERS);

	let payload: { event_id?: unknown };
	try {
		const parsed: unknown = JSON.parse(body);
		payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as { event_id?: unknown } : {};
	} catch {
		return c.json({ error: "invalid_json" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	const eventId = c.req.header("x-phaseo-event-id") ?? (typeof payload.event_id === "string" ? payload.event_id.trim() : "");
	if (!EVENT_ID.test(eventId)) return c.json({ error: "event_id_required" }, 400, PRIVATE_NO_STORE_HEADERS);

	const sync = syncProviderCatalog(c.env, providerSlug, "webhook", eventId).catch((error) => {
		console.error("provider_catalog_webhook_sync_failed", { providerSlug, eventId, error: error instanceof Error ? error.message : String(error) });
	});
	if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(sync);
	else await sync;
	return c.json({ accepted: true, eventId }, 202, PRIVATE_NO_STORE_HEADERS);
});

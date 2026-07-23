// Purpose: Provider webhook receiver for async batch job finalization.
// Why: Native provider batch webhooks should trigger managed finalization and user webhooks.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { dispatchBackground, ensureRuntimeForBackground } from "@/runtime/env";
import { claimProviderEvent, insertProviderEvent } from "@core/provider-events";
import { json, withRuntime } from "@/routes/utils";

import {
	GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
	OPENAI_PROVIDER_ID,
	extractOpenAiEventId,
	processGoogleAiStudioBatchWebhook,
	pickHeaders,
	processOpenAiBatchWebhook,
	readProviderWebhookBody,
	verifyGoogleAiStudioBatchWebhookSignature,
	verifyOpenAiBatchWebhookSignature,
} from "./batch-webhooks.helpers";

export const internalBatchWebhookRoutes = new Hono<Env>();

internalBatchWebhookRoutes.post("/openai", withRuntime(async (req) => {
	const body = await readProviderWebhookBody(req);
	if (!body.ok) return json({ ok: false, error: "payload_too_large" }, 413, { "Cache-Control": "no-store" });
	const rawBody = body.rawBody;
	const signatureOk = await verifyOpenAiBatchWebhookSignature(req, rawBody);
	if (!signatureOk) {
		return json({ ok: false, error: "invalid_signature" }, 401, { "Cache-Control": "no-store" });
	}

	let payload: any = {};
	try {
		payload = rawBody.length ? JSON.parse(rawBody) : {};
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400, { "Cache-Control": "no-store" });
	}
	const eventType = String(payload?.type ?? payload?.event ?? "").trim();
	if (!eventType) {
		return json({ ok: false, error: "invalid_event_type" }, 400, { "Cache-Control": "no-store" });
	}
	const eventId = extractOpenAiEventId(req, payload);
	if (!eventId) {
		return json({ ok: false, error: "missing_event_id" }, 400, { "Cache-Control": "no-store" });
	}

	const dedupe = await insertProviderEvent({
		provider: OPENAI_PROVIDER_ID,
		providerEventId: eventId,
		kind: eventType,
		payload,
		headers: pickHeaders(req),
	});
	if (!dedupe.inserted && dedupe.record?.processedAt) {
		return json({ ok: true, deduped: true, processed: Boolean(dedupe.record?.processedAt) }, 200, {
			"Cache-Control": "no-store",
		});
	}
	const claimed = await claimProviderEvent({
		provider: OPENAI_PROVIDER_ID,
		providerEventId: eventId,
		workerId: `openai-batch-webhook:${eventId}`,
	});
	if (!claimed) {
		return json({ ok: true, deduped: true, accepted: true, processed: false }, 202, {
			"Cache-Control": "no-store",
		});
	}

	dispatchBackground((async () => {
		const releaseRuntime = ensureRuntimeForBackground();
		try {
			await processOpenAiBatchWebhook({
				eventId,
				eventType,
				payload,
			});
		} catch (error) {
			console.error("openai_batch_webhook_processing_failed", {
				error,
				eventId,
				eventType,
			});
		} finally {
			releaseRuntime();
		}
	})());

	return json({ ok: true, accepted: true, replayed: !dedupe.inserted }, 202, { "Cache-Control": "no-store" });
}));

async function handleGoogleAiStudioBatchWebhook(req: Request): Promise<Response> {
	const body = await readProviderWebhookBody(req);
	if (!body.ok) return json({ ok: false, error: "payload_too_large" }, 413, { "Cache-Control": "no-store" });
	const rawBody = body.rawBody;
	const signatureOk = await verifyGoogleAiStudioBatchWebhookSignature(req, rawBody);
	if (!signatureOk) {
		return json({ ok: false, error: "invalid_signature" }, 401, { "Cache-Control": "no-store" });
	}

	let payload: any = {};
	try {
		payload = rawBody.length ? JSON.parse(rawBody) : {};
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400, { "Cache-Control": "no-store" });
	}
	const eventType = String(payload?.type ?? payload?.event ?? "").trim();
	if (!eventType) {
		return json({ ok: false, error: "invalid_event_type" }, 400, { "Cache-Control": "no-store" });
	}
	const eventId = extractOpenAiEventId(req, payload);
	if (!eventId) {
		return json({ ok: false, error: "missing_event_id" }, 400, { "Cache-Control": "no-store" });
	}

	const dedupe = await insertProviderEvent({
		provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
		providerEventId: eventId,
		kind: eventType,
		payload,
		headers: pickHeaders(req),
	});
	if (!dedupe.inserted && dedupe.record?.processedAt) {
		return json({ ok: true, deduped: true, processed: Boolean(dedupe.record?.processedAt) }, 200, {
			"Cache-Control": "no-store",
		});
	}
	const claimed = await claimProviderEvent({
		provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
		providerEventId: eventId,
		workerId: `google-ai-studio-batch-webhook:${eventId}`,
	});
	if (!claimed) {
		return json({ ok: true, deduped: true, accepted: true, processed: false }, 202, {
			"Cache-Control": "no-store",
		});
	}

	dispatchBackground((async () => {
		const releaseRuntime = ensureRuntimeForBackground();
		try {
			await processGoogleAiStudioBatchWebhook({
				eventId,
				eventType,
				payload,
			});
		} catch (error) {
			console.error("google_ai_studio_batch_webhook_processing_failed", {
				error,
				eventId,
				eventType,
			});
		} finally {
			releaseRuntime();
		}
	})());

	return json({ ok: true, accepted: true, replayed: !dedupe.inserted }, 202, { "Cache-Control": "no-store" });
}

internalBatchWebhookRoutes.post("/gemini", withRuntime(handleGoogleAiStudioBatchWebhook));
internalBatchWebhookRoutes.post("/google-ai-studio", withRuntime(handleGoogleAiStudioBatchWebhook));

// Purpose: Provider webhook receiver for async video job finalization.
// Why: Completion billing must be triggered by provider terminal events.
// How: Verifies signatures, deduplicates events, and finalizes in background.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { dispatchBackground, ensureRuntimeForBackground } from "@/runtime/env";
import { insertProviderEvent } from "@core/provider-events";
import { json, withRuntime } from "@/routes/utils";

import {
	ALIBABA_PROVIDER_ID,
	OPENAI_PROVIDER_ID,
	extractAlibabaEventType,
	extractAlibabaTaskId,
	extractOpenAiEventId,
	pickHeaders,
	processAlibabaVideoWebhook,
	processOpenAiVideoWebhook,
	sha256Hex,
	verifyAlibabaWebhookAuth,
	verifyOpenAiWebhookSignature,
} from "./video-webhooks.helpers";

export const internalVideoWebhookRoutes = new Hono<Env>();

function processOpenAiVideoWebhookInBackground(args: {
	eventId: string;
	eventType: string;
	payload: any;
}) {
	dispatchBackground((async () => {
		const releaseRuntime = ensureRuntimeForBackground();
		try {
			await processOpenAiVideoWebhook(args);
		} catch (error) {
			console.error("openai_video_webhook_processing_failed", {
				error,
				eventId: args.eventId,
				eventType: args.eventType,
			});
		} finally {
			releaseRuntime();
		}
	})());
}

function processAlibabaVideoWebhookInBackground(args: {
	eventId: string;
	eventType: string;
	payload: any;
	taskId: string;
}) {
	dispatchBackground((async () => {
		const releaseRuntime = ensureRuntimeForBackground();
		try {
			await processAlibabaVideoWebhook(args);
		} catch (error) {
			console.error("alibaba_video_webhook_processing_failed", {
				error,
				eventId: args.eventId,
				eventType: args.eventType,
			});
		} finally {
			releaseRuntime();
		}
	})());
}

internalVideoWebhookRoutes.post("/openai", withRuntime(async (req) => {
	const rawBody = await req.text();
	const signatureOk = await verifyOpenAiWebhookSignature(req, rawBody);
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
	if (!dedupe.inserted) {
		if (!dedupe.record?.processedAt) return json({ ok: true, deduped: true, accepted: true, processed: false }, 202, {
			"Cache-Control": "no-store",
		});
		return json({ ok: true, deduped: true, processed: Boolean(dedupe.record?.processedAt) }, 200, {
			"Cache-Control": "no-store",
		});
	}

	processOpenAiVideoWebhookInBackground({ eventId, eventType, payload });

	return json({ ok: true, accepted: true }, 202, { "Cache-Control": "no-store" });
}));

internalVideoWebhookRoutes.post("/alibaba", withRuntime(async (req) => {
	if (!verifyAlibabaWebhookAuth(req)) {
		return json({ ok: false, error: "invalid_signature" }, 401, { "Cache-Control": "no-store" });
	}

	const rawBody = await req.text();
	let payload: any = {};
	try {
		payload = rawBody.length ? JSON.parse(rawBody) : {};
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400, { "Cache-Control": "no-store" });
	}

	const eventType = extractAlibabaEventType(payload);
	if (!eventType) {
		return json({ ok: false, error: "invalid_event_type" }, 400, { "Cache-Control": "no-store" });
	}

	const taskId = extractAlibabaTaskId(payload);
	if (!taskId) {
		return json({ ok: true, accepted: true, ignored: "missing_task_id" }, 202, { "Cache-Control": "no-store" });
	}

	const eventIdCandidates = [
		req.headers.get("x-acs-event-id"),
		req.headers.get("x-event-id"),
		payload?.id,
		payload?.eventId,
		payload?.event_id,
		payload?.data?.id,
	];
	let eventId = "";
	for (const candidate of eventIdCandidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			eventId = candidate.trim();
			break;
		}
	}
	if (!eventId) {
		const bodyHash = await sha256Hex(rawBody);
		eventId = `${ALIBABA_PROVIDER_ID}:${eventType}:${taskId}:${bodyHash}`;
	}

	const dedupe = await insertProviderEvent({
		provider: ALIBABA_PROVIDER_ID,
		providerEventId: eventId,
		kind: eventType,
		payload,
		headers: pickHeaders(req),
	});
	if (!dedupe.inserted) {
		if (!dedupe.record?.processedAt) return json({ ok: true, deduped: true, accepted: true, processed: false }, 202, {
			"Cache-Control": "no-store",
		});
		return json({ ok: true, deduped: true, processed: Boolean(dedupe.record?.processedAt) }, 200, {
			"Cache-Control": "no-store",
		});
	}

	processAlibabaVideoWebhookInBackground({ eventId, eventType, payload, taskId });

	return json({ ok: true, accepted: true }, 202, { "Cache-Control": "no-store" });
}));

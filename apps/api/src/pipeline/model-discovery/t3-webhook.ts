// Forwards private watcher alerts to a T3 Code webhook-triggered task, where an agent thread checks and acts on
// each change. Best effort only: Discord and Slack remain the delivery of record, so a T3 failure is logged and
// never defers saving watcher state or re-sends the alert.
import { getBindings } from "@/runtime/env";
import { readBindingEnv } from "./helpers";

const T3_WEBHOOK_TIMEOUT_MS = 15_000;
/**
 * KV fallback for the URL. phaseo-gateway is at Cloudflare's 200 text-binding limit, so the URL can live in
 * GATEWAY_CACHE under this key instead of a secret: `wrangler kv key put <key> <url> --binding GATEWAY_CACHE --remote`.
 */
export const T3_WEBHOOK_URL_KV_KEY = "model-discovery/t3-webhook-url/v1";
/** Structured data is dropped above this size; the full alert text is always sent. */
const MAX_T3_DATA_BYTES = 200_000;

export type T3ModelDiscoveryEventType = "model_discovery.changes" | "model_discovery.provider_health";

export type T3ModelDiscoveryEvent = {
	event: T3ModelDiscoveryEventType;
	/** Stable id for this alert's content, so a replayed delivery can be recognised. */
	id: string | null;
	runId: string | null;
	source: string | null;
	sentAt: string;
	/** The full, untruncated alert text as operators see it in Discord. */
	text: string;
	/** Structured change data when it fits; null when omitted for size. */
	data: unknown;
};

export type T3ForwardResult = { sent: boolean; error?: string | null };

async function readKvWebhookUrl(): Promise<string | null> {
	try {
		const kv = (getBindings() as unknown as { GATEWAY_CACHE?: KVNamespace }).GATEWAY_CACHE;
		const value = kv ? await kv.get(T3_WEBHOOK_URL_KV_KEY) : null;
		return value?.trim() || null;
	} catch (error) {
		console.warn("[model-discovery] T3 webhook URL not readable from KV:", error instanceof Error ? error.message : String(error));
		return null;
	}
}

/** The env binding wins; otherwise the KV key. Only https URLs are used. */
export async function readT3WebhookUrl(): Promise<string | null> {
	const raw = readBindingEnv(["MODEL_DISCOVERY_T3_WEBHOOK_URL"]) ?? (await readKvWebhookUrl());
	if (!raw) return null;
	try {
		const parsed = new URL(raw);
		return parsed.protocol === "https:" ? parsed.toString() : null;
	} catch {
		return null;
	}
}

export function buildT3ModelDiscoveryEvent(args: {
	event: T3ModelDiscoveryEventType;
	text: string;
	data?: unknown;
	id?: string | null;
	runId?: string | null;
	source?: string | null;
	now?: Date;
}): T3ModelDiscoveryEvent {
	let data: unknown = args.data ?? null;
	if (data !== null) {
		const size = new TextEncoder().encode(JSON.stringify(data)).byteLength;
		if (size > MAX_T3_DATA_BYTES) data = null;
	}
	return {
		event: args.event,
		id: args.id ?? null,
		runId: args.runId ?? null,
		source: args.source ?? null,
		sentAt: (args.now ?? new Date()).toISOString(),
		text: args.text,
		data,
	};
}

/** Posts one event to the configured T3 webhook. Returns `sent: false` when none is configured; never throws. */
export async function forwardToT3Webhook(
	event: T3ModelDiscoveryEvent,
	request: typeof fetch = fetch,
): Promise<T3ForwardResult> {
	const webhookUrl = await readT3WebhookUrl();
	if (!webhookUrl || !event.text.trim()) return { sent: false };
	try {
		const response = await request(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(event),
			signal: AbortSignal.timeout(T3_WEBHOOK_TIMEOUT_MS),
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
		}
		return { sent: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[model-discovery] T3 webhook not delivered (${event.event}): ${message}`);
		return { sent: false, error: message };
	}
}

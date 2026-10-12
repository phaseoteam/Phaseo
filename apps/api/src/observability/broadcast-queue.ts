import { clearRuntime, configureRuntime, getBindings, getSupabaseAdmin } from "@/runtime/env";
import type { GatewayBindings } from "@/runtime/env.types";
import { mapWithConcurrency } from "@/pipeline/model-discovery/concurrency";
import { broadcastDelivery } from "./broadcast-destinations";
import type { BroadcastQueueMessage, BroadcastTelemetry } from "./broadcast-event";
import {
	MAX_ATTEMPTS,
	deliverGatewayOtlpPayload,
	deliverGatewayWebhookPayload,
	destinationConfig,
	renderBroadcastPayload,
	type Destination,
} from "./otlp-export";

// Workers allow six simultaneous outbound connections per invocation.
const DELIVERY_CONCURRENCY = 6;
// OTLP vendors cap request bodies at 1-5 MB; batches are split below that.
const MAX_OTLP_REQUEST_BYTES = 3 * 1024 * 1024;
// Cloudflare caps one sendBatch call at 256 KB and 100 messages.
const MAX_REQUEUE_BATCH_BYTES = 200_000;
const MAX_REQUEUE_BATCH_MESSAGES = 100;
// Used when receipts or destinations could not be loaded, so nothing was attempted.
const SETUP_FAILURE_RETRY_SECONDS = 30;

type Outcome = Awaited<ReturnType<typeof deliverGatewayOtlpPayload>>;
type QueuedDestination = Destination & { enabled: boolean };
type QueuedMessage = Message<BroadcastQueueMessage>;
type Event = { message: QueuedMessage; body: BroadcastQueueMessage; telemetry: BroadcastTelemetry };
// One request: an OTLP batch of events for a destination, or one webhook event.
type Delivery = { destination: QueuedDestination; config: Record<string, unknown>; events: Event[]; payload: unknown };
// Destinations an event still needs, and the soonest any may be retried.
type Pending = { ids: string[]; delayMs: number };

export type BroadcastQueueSummary = {
	messages: number;
	duplicates: number;
	requests: number;
	delivered: number;
	retried: number;
	failed: number;
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isBroadcastMessage(body: unknown): body is BroadcastQueueMessage {
	const value = body as BroadcastQueueMessage | null;
	return Boolean(value && value.v === 1 && typeof value.eventId === "string" && Array.isArray(value.destinationIds) &&
		(value.telemetry || typeof value.spillKey === "string"));
}

// Only an event's first message needs a receipt. Requeued retries and
// redelivered messages were checked when the event was first received.
function isFirstDelivery(message: QueuedMessage): boolean {
	return message.body.attempt === 1 && message.attempts <= 1;
}

// Records each newly received event id and returns those already recorded,
// so an event emitted twice is delivered once.
async function claimReceipts(messages: QueuedMessage[]): Promise<Set<string>> {
	const ids = [...new Set(messages.filter(isFirstDelivery).map((message) => message.body.eventId))];
	if (!ids.length) return new Set();
	const { data, error } = await getSupabaseAdmin()
		.from("broadcast_event_receipts")
		.upsert(ids.map((event_id) => ({ event_id })), { onConflict: "event_id", ignoreDuplicates: true })
		.select("event_id");
	if (error) throw new Error(`broadcast_receipts_claim_failed:${error.message}`);
	const claimed = new Set(((data ?? []) as Array<{ event_id: string }>).map((row) => row.event_id));
	return new Set(ids.filter((id) => !claimed.has(id)));
}

async function loadTelemetry(body: BroadcastQueueMessage): Promise<BroadcastTelemetry | null> {
	if (body.telemetry) return body.telemetry;
	const object = await getBindings().GATEWAY_IO_LOGS_BUCKET?.get(body.spillKey!);
	return object ? await object.json<BroadcastTelemetry>() : null;
}

async function loadDestinations(ids: string[]): Promise<Map<string, QueuedDestination>> {
	const { data, error } = await getSupabaseAdmin()
		.from("workspace_broadcast_destinations")
		.select("id,destination_id,destination_config,destination_config_ciphertext,destination_config_iv,destination_config_key_version,privacy_exclude_prompts_and_outputs,include_generation_metadata,include_cost_metadata,include_identity_metadata,include_request_context,enabled")
		.in("id", ids);
	if (error) throw new Error(`broadcast_destinations_load_failed:${error.message}`);
	return new Map(((data ?? []) as QueuedDestination[]).map((destination) => [destination.id, destination]));
}

// Payloads for the same destination share one request, split to stay under
// MAX_OTLP_REQUEST_BYTES. Each OTLP payload is a list of resourceSpans, so
// concatenating them is still a valid export request.
function otlpDeliveries(destination: QueuedDestination, config: Record<string, unknown>, events: Event[]): Delivery[] {
	const deliveries: Delivery[] = [];
	let current: { events: Event[]; spans: unknown[]; bytes: number } = { events: [], spans: [], bytes: 0 };
	const flush = () => {
		if (!current.events.length) return;
		deliveries.push({ destination, config, events: current.events, payload: { resourceSpans: current.spans } });
		current = { events: [], spans: [], bytes: 0 };
	};
	for (const event of events) {
		const payload = renderBroadcastPayload(event.telemetry, destination) as { resourceSpans?: unknown[] };
		const spans = payload.resourceSpans ?? [];
		const bytes = JSON.stringify(spans).length;
		if (current.bytes + bytes > MAX_OTLP_REQUEST_BYTES) flush();
		current.events.push(event);
		current.spans.push(...spans);
		current.bytes += bytes;
	}
	flush();
	return deliveries;
}

async function deliver(delivery: Delivery): Promise<Outcome> {
	const attempts = Math.max(...delivery.events.map((event) => event.body.attempt));
	try {
		return broadcastDelivery(delivery.destination.destination_id) === "webhook"
			? await deliverGatewayWebhookPayload(delivery.payload, delivery.config, attempts)
			: await deliverGatewayOtlpPayload(delivery.payload, delivery.config, attempts);
	} catch (error) {
		return { delivered: false, retryable: false, status: null, delayMs: 0, error: errorMessage(error) };
	}
}

// Delivers loaded events to their destinations and returns what each still needs.
async function deliverEvents(
	events: Event[],
	destinations: Map<string, QueuedDestination>,
	configs: Map<string, Promise<Record<string, unknown>>>,
	summary: BroadcastQueueSummary,
): Promise<Map<Event, Pending>> {
	const remaining = new Map<Event, Pending>(events.map((event) => [event, { ids: [], delayMs: 0 }]));
	const record = (event: Event, destinationId: string, outcome: Outcome) => {
		if (outcome.delivered) {
			summary.delivered += 1;
			return;
		}
		if (outcome.retryable && event.body.attempt < MAX_ATTEMPTS) {
			const pending = remaining.get(event)!;
			pending.ids.push(destinationId);
			pending.delayMs = Math.max(pending.delayMs, outcome.delayMs);
			summary.retried += 1;
			return;
		}
		summary.failed += 1;
	};

	const deliveries: Delivery[] = [];
	const byDestination = new Map<string, Event[]>();
	for (const event of events) {
		for (const destinationId of event.body.destinationIds) {
			const list = byDestination.get(destinationId) ?? [];
			list.push(event);
			byDestination.set(destinationId, list);
		}
	}
	for (const [destinationId, destinationEvents] of byDestination) {
		const destination = destinations.get(destinationId);
		const delivery = destination?.enabled ? broadcastDelivery(destination.destination_id) : null;
		if (!destination || !delivery) {
			for (const event of destinationEvents) record(event, destinationId, { delivered: false, retryable: false, status: null, delayMs: 0, error: "Broadcast destination unavailable or disabled" });
			continue;
		}
		let config: Record<string, unknown>;
		try {
			if (!configs.has(destinationId)) configs.set(destinationId, destinationConfig(destination));
			config = await configs.get(destinationId)!;
		} catch (error) {
			console.error("broadcast_destination_config_failed", { destinationId, error: errorMessage(error) });
			for (const event of destinationEvents) record(event, destinationId, { delivered: false, retryable: false, status: null, delayMs: 0, error: errorMessage(error) });
			continue;
		}
		if (delivery === "otlp") deliveries.push(...otlpDeliveries(destination, config, destinationEvents));
		else {
			for (const event of destinationEvents) {
				deliveries.push({ destination, config, events: [event], payload: renderBroadcastPayload(event.telemetry, destination) });
			}
		}
	}

	summary.requests += deliveries.length;
	await mapWithConcurrency(deliveries, DELIVERY_CONCURRENCY, async (delivery) => {
		const outcome = await deliver(delivery);
		if (!outcome.delivered) {
			console.warn("broadcast_delivery_failed", {
				destinationId: delivery.destination.id,
				events: delivery.events.length,
				status: outcome.status,
				retryable: outcome.retryable,
				error: outcome.error,
			});
		}
		for (const event of delivery.events) record(event, delivery.destination.id, outcome);
	});
	return remaining;
}

const delaySeconds = (delayMs: number) => Math.min(Math.ceil(delayMs / 1_000), 86_400);

// A retry is a new message for only the destinations that failed, so the others
// are not sent the event twice. Returns the events whose retry could not be sent.
async function requeue(retries: Array<{ event: Event } & Pending>): Promise<Set<Event>> {
	const chunks: Array<typeof retries> = [];
	let current: typeof retries = [];
	let bytes = 0;
	for (const retry of retries) {
		const size = JSON.stringify(retry.event.body).length;
		if (current.length && (bytes + size > MAX_REQUEUE_BATCH_BYTES || current.length >= MAX_REQUEUE_BATCH_MESSAGES)) {
			chunks.push(current);
			current = [];
			bytes = 0;
		}
		current.push(retry);
		bytes += size;
	}
	if (current.length) chunks.push(current);

	const unsent = new Set<Event>();
	for (const chunk of chunks) {
		try {
			await getBindings().BROADCAST_QUEUE!.sendBatch(chunk.map((retry) => ({
				body: { ...retry.event.body, destinationIds: retry.ids, attempt: retry.event.body.attempt + 1 },
				contentType: "json" as const,
				delaySeconds: delaySeconds(retry.delayMs),
			})));
		} catch (error) {
			console.error("broadcast_queue_requeue_failed", { events: chunk.length, error: errorMessage(error) });
			for (const retry of chunk) unsent.add(retry.event);
		}
	}
	return unsent;
}

export async function processBroadcastQueueBatch(batch: MessageBatch<unknown>): Promise<BroadcastQueueSummary> {
	const summary: BroadcastQueueSummary = { messages: batch.messages.length, duplicates: 0, requests: 0, delivered: 0, retried: 0, failed: 0 };
	let messages: QueuedMessage[] = [];
	for (const message of batch.messages) {
		if (isBroadcastMessage(message.body)) messages.push(message as QueuedMessage);
		else {
			console.error("broadcast_queue_message_invalid", { id: message.id });
			message.ack();
		}
	}
	if (!messages.length) return summary;

	let destinations: Map<string, QueuedDestination>;
	try {
		const duplicates = await claimReceipts(messages);
		// A duplicate shares its spill key with the original, which deletes it.
		const isDuplicate = (message: QueuedMessage) => isFirstDelivery(message) && duplicates.has(message.body.eventId);
		for (const message of messages.filter(isDuplicate)) {
			summary.duplicates += 1;
			message.ack();
		}
		messages = messages.filter((message) => !isDuplicate(message));
		if (!messages.length) return summary;
		destinations = await loadDestinations([...new Set(messages.flatMap((message) => message.body.destinationIds))]);
	} catch (error) {
		console.error("broadcast_queue_batch_setup_failed", { error: errorMessage(error) });
		for (const message of messages) message.retry({ delaySeconds: SETUP_FAILURE_RETRY_SECONDS });
		return summary;
	}

	// Inline events are delivered together. A spilled event can be many megabytes,
	// so each is loaded and delivered on its own, then released.
	const inline = messages.filter((message) => message.body.telemetry);
	const rounds = [
		...(inline.length ? [inline] : []),
		...messages.filter((message) => !message.body.telemetry).map((message) => [message]),
	];
	const configs = new Map<string, Promise<Record<string, unknown>>>();
	const retries: Array<{ event: Event } & Pending> = [];
	const finished: Event[] = [];
	for (const round of rounds) {
		const events: Event[] = [];
		for (const message of round) {
			try {
				const telemetry = await loadTelemetry(message.body);
				if (telemetry) events.push({ message, body: message.body, telemetry });
				else {
					console.error("broadcast_queue_spill_missing", { eventId: message.body.eventId });
					message.ack();
				}
			} catch (error) {
				console.error("broadcast_queue_spill_load_failed", { eventId: message.body.eventId, error: errorMessage(error) });
				message.retry();
			}
		}
		if (!events.length) continue;
		const remaining = await deliverEvents(events, destinations, configs, summary);
		for (const event of events) {
			const pending = remaining.get(event)!;
			if (pending.ids.length) retries.push({ event, ...pending });
			else finished.push(event);
		}
	}

	const unsent = retries.length ? await requeue(retries) : new Set<Event>();
	for (const retry of retries) {
		// Retrying the original message resends it to every destination.
		if (unsent.has(retry.event)) retry.event.message.retry({ delaySeconds: delaySeconds(retry.delayMs) });
		else retry.event.message.ack();
	}
	for (const event of finished) event.message.ack();
	const finishedSpills = finished.flatMap((event) => event.body.spillKey ? [event.body.spillKey] : []);
	if (finishedSpills.length) {
		try {
			await getBindings().GATEWAY_IO_LOGS_BUCKET?.delete(finishedSpills);
		} catch (error) {
			// pruneBroadcastSpill removes them later.
			console.error("broadcast_queue_spill_delete_failed", { keys: finishedSpills.length, error: errorMessage(error) });
		}
	}
	return summary;
}

export async function handleBroadcastQueue(batch: MessageBatch<unknown>, env: GatewayBindings): Promise<void> {
	configureRuntime(env);
	try {
		const summary = await processBroadcastQueueBatch(batch);
		console.log("broadcast_queue_batch_completed", summary);
	} finally {
		clearRuntime();
	}
}

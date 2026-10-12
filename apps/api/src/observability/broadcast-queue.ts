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
// Used when the destinations could not be loaded, so nothing was attempted.
const LOAD_FAILURE_RETRY_SECONDS = 30;

type Outcome = Awaited<ReturnType<typeof deliverGatewayOtlpPayload>>;
type QueuedDestination = Destination & { enabled: boolean };
type Event = { message: Message<BroadcastQueueMessage>; body: BroadcastQueueMessage; telemetry: BroadcastTelemetry };
// One request: an OTLP batch of events for a destination, or one webhook event.
type Delivery = { destination: QueuedDestination; config: Record<string, unknown>; events: Event[]; payload: unknown };

export type BroadcastQueueSummary = {
	messages: number;
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

export async function processBroadcastQueueBatch(batch: MessageBatch<unknown>): Promise<BroadcastQueueSummary> {
	const summary: BroadcastQueueSummary = { messages: batch.messages.length, requests: 0, delivered: 0, retried: 0, failed: 0 };
	const events: Event[] = [];
	for (const message of batch.messages) {
		if (!isBroadcastMessage(message.body)) {
			console.error("broadcast_queue_message_invalid", { id: message.id });
			message.ack();
			continue;
		}
		const body = message.body;
		try {
			const telemetry = await loadTelemetry(body);
			if (telemetry) events.push({ message: message as Message<BroadcastQueueMessage>, body, telemetry });
			else {
				console.error("broadcast_queue_spill_missing", { eventId: body.eventId });
				message.ack();
			}
		} catch (error) {
			console.error("broadcast_queue_spill_load_failed", { eventId: body.eventId, error: errorMessage(error) });
			message.retry();
		}
	}
	if (!events.length) return summary;

	let destinations: Map<string, QueuedDestination>;
	try {
		destinations = await loadDestinations([...new Set(events.flatMap((event) => event.body.destinationIds))]);
	} catch (error) {
		console.error("broadcast_queue_destinations_load_failed", { error: errorMessage(error) });
		for (const event of events) event.message.retry({ delaySeconds: LOAD_FAILURE_RETRY_SECONDS });
		return summary;
	}

	// Destinations each event still needs, and the soonest any may be retried.
	const remaining = new Map<Event, { ids: string[]; delayMs: number }>(events.map((event) => [event, { ids: [], delayMs: 0 }]));
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
			config = await destinationConfig(destination);
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

	summary.requests = deliveries.length;
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

	// A retry is a new message for only the destinations that failed, so the
	// others are not sent the event twice.
	const retries = events.filter((event) => remaining.get(event)!.ids.length);
	let requeued = false;
	if (retries.length) {
		try {
			await getBindings().BROADCAST_QUEUE!.sendBatch(retries.map((event) => {
				const pending = remaining.get(event)!;
				return {
					body: { ...event.body, destinationIds: pending.ids, attempt: event.body.attempt + 1 },
					contentType: "json" as const,
					delaySeconds: Math.min(Math.ceil(pending.delayMs / 1_000), 86_400),
				};
			}));
			requeued = true;
		} catch (error) {
			console.error("broadcast_queue_requeue_failed", { events: retries.length, error: errorMessage(error) });
		}
	}

	const finishedSpills: string[] = [];
	for (const event of events) {
		const pending = remaining.get(event)!;
		if (pending.ids.length && !requeued) {
			// Retrying the original message resends it to every destination.
			event.message.retry({ delaySeconds: Math.min(Math.ceil(pending.delayMs / 1_000), 86_400) });
			continue;
		}
		if (!pending.ids.length && event.body.spillKey) finishedSpills.push(event.body.spillKey);
		event.message.ack();
	}
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

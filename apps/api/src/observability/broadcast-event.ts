import { getBindings } from "@/runtime/env";
import type { AsyncGenAiTelemetry, GatewayGenAiTelemetry } from "./otel-genai";

// One completed request, as sent to BROADCAST_QUEUE. The consumer renders it for
// each destination, so a request costs one message however many destinations
// it goes to.
export type BroadcastTelemetry =
	| { kind: "gateway"; args: GatewayGenAiTelemetry }
	| { kind: "async"; args: AsyncGenAiTelemetry };

export type BroadcastQueueMessage = {
	v: 1;
	eventId: string;
	workspaceId: string;
	// workspace_broadcast_destinations ids still to deliver to.
	destinationIds: string[];
	attempt: number;
	// Exactly one of these: the telemetry; the telemetry as gzipped JSON, sent
	// with the v8 content type, when it would take more than one queue operation;
	// or the R2 key holding it when even that would exceed the queue's 128 KB limit.
	telemetry?: BroadcastTelemetry;
	telemetryGzip?: Uint8Array;
	spillKey?: string;
	// Size of the telemetry as JSON, set with telemetryGzip.
	telemetryBytes?: number;
};

export const BROADCAST_SPILL_PREFIX = "broadcast-spill/";
const MAX_INLINE_MESSAGE_BYTES = 120_000;
// Queues bills one operation for each 64 KB (64,000 bytes) written, read or
// deleted, and adds about 100 bytes of metadata to each message. Larger events
// are compressed, which usually brings them back to one operation each.
const MAX_ONE_OPERATION_BYTES = 63_000;
// The consumer decompresses a batch's events together, so an event larger than
// this as JSON goes to R2 instead.
export const MAX_COMPRESSED_TELEMETRY_BYTES = 1_000_000;

const encoder = new TextEncoder();

// The message's size as the queue counts it.
export function broadcastMessageBytes(message: BroadcastQueueMessage): number {
	const { telemetryGzip, ...rest } = message;
	return encoder.encode(JSON.stringify(rest)).byteLength + (telemetryGzip?.byteLength ?? 0);
}

async function gzip(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipJson<T>(bytes: Uint8Array): Promise<T> {
	// Copied so the Blob gets an ArrayBuffer-backed view, as its type requires.
	const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
	return await new Response(stream).json() as T;
}

export function broadcastQueueEnabled(): boolean {
	const bindings = getBindings();
	return Boolean(bindings.BROADCAST_QUEUE) && String(bindings.BROADCAST_QUEUE_ENABLED ?? "").toLowerCase() === "true";
}

// Keys start with the UTC date so pruneBroadcastSpill can find leftovers by
// listing in key order.
export function broadcastSpillKey(eventId: string, now = new Date()): string {
	return `${BROADCAST_SPILL_PREFIX}${now.toISOString().slice(0, 10)}/${encodeURIComponent(eventId)}.json`;
}

// Sends the event to BROADCAST_QUEUE. Returns false when the queue is not in use
// or the send failed, so the caller can fall back to the outbox.
export async function publishBroadcastEvent(args: {
	eventId: string;
	workspaceId: string;
	destinationIds: string[];
	telemetry: BroadcastTelemetry;
}): Promise<boolean> {
	if (!broadcastQueueEnabled()) return false;
	const bindings = getBindings();
	const message: BroadcastQueueMessage = {
		v: 1,
		eventId: args.eventId,
		workspaceId: args.workspaceId,
		destinationIds: args.destinationIds,
		attempt: 1,
		telemetry: args.telemetry,
	};
	try {
		const queue = bindings.BROADCAST_QUEUE!;
		if (broadcastMessageBytes(message) <= MAX_ONE_OPERATION_BYTES) {
			await queue.send(message, { contentType: "json" });
			return true;
		}
		const { telemetry, ...envelope } = message;
		const json = JSON.stringify(telemetry);
		const telemetryBytes = encoder.encode(json).byteLength;
		if (telemetryBytes <= MAX_COMPRESSED_TELEMETRY_BYTES) {
			const compressed: BroadcastQueueMessage = { ...envelope, telemetryGzip: await gzip(json), telemetryBytes };
			if (broadcastMessageBytes(compressed) <= MAX_INLINE_MESSAGE_BYTES) {
				await queue.send(compressed, { contentType: "v8" });
				return true;
			}
		}
		const bucket = bindings.GATEWAY_IO_LOGS_BUCKET;
		if (!bucket) return false;
		const spillKey = broadcastSpillKey(args.eventId);
		await bucket.put(spillKey, json, { httpMetadata: { contentType: "application/json" } });
		await queue.send({ ...envelope, spillKey }, { contentType: "json" });
		return true;
	} catch (error) {
		console.error("broadcast_queue_publish_failed", {
			eventId: args.eventId,
			workspaceId: args.workspaceId,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

// Longer than the queue's message retention (four days, the default), so no
// message still in the queue can point at a pruned object.
const SPILL_RETENTION_DAYS = 5;

// Spilled events are deleted once delivered or given up on. This removes any
// left behind, for example by messages the queue dropped after its own retries.
export async function pruneBroadcastSpill(bucket: R2Bucket, now = new Date()): Promise<number> {
	const cutoff = new Date(now.getTime() - SPILL_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
	const listed = await bucket.list({ prefix: BROADCAST_SPILL_PREFIX, limit: 1000 });
	const stale = listed.objects
		.map((object) => object.key)
		.filter((key) => key.slice(BROADCAST_SPILL_PREFIX.length, BROADCAST_SPILL_PREFIX.length + 10) < cutoff);
	if (stale.length) await bucket.delete(stale);
	return stale.length;
}

// Purpose: Store streamed responses in the response cache.
// Why: Most text traffic streams; hits replay the stream as SSE.
// How: Records each frame as it is sent to the client and stores the frames
//      only when the stream finished cleanly: a terminal frame was seen, the
//      client stayed connected, and nothing failed mid-stream.
import {
	buildCachedResponseRecord,
	MAX_RESPONSE_CACHE_RECORD_BYTES,
	type CachedStreamFrame,
} from "@/core/response-cache";
import { dispatchBackground, ensureRuntimeForBackground, getResponseCache } from "@/runtime/env";
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import type { OutboundStreamFrame } from "./streaming";

export type StreamCacheCapture = {
	onOutboundFrame: (frame: OutboundStreamFrame) => void;
	onStreamEnd: (info: { aborted: boolean; downstreamClosed: boolean }) => void;
};

/** Returns null unless this request is a cache miss that should be stored. */
export function createStreamCacheCapture(args: {
	ctx: PipelineContext;
	result: RequestResult;
	/** Whether the stream failed or ended without a usable finish, read at the end. */
	failed: () => boolean;
	finishReason: () => string | null;
	maxBytes?: number;
}): StreamCacheCapture | null {
	const { ctx, result } = args;
	const cacheState = ctx.responseCache;
	if (
		!cacheState?.enabled ||
		cacheState.status !== "miss" ||
		!cacheState.key ||
		!cacheState.fingerprint ||
		typeof cacheState.ttlSeconds !== "number" ||
		result.upstream.status !== 200
	) {
		return null;
	}
	// Resolve the store now: the stream may end after this request releases its runtime.
	const store = getResponseCache();
	if (!store) return null;
	const maxBytes = args.maxBytes ?? MAX_RESPONSE_CACHE_RECORD_BYTES;
	const frames: CachedStreamFrame[] = [];
	let bytes = 0;
	let overflowed = false;

	return {
		onOutboundFrame(frame) {
			if (overflowed) return;
			// Serializing also snapshots the frame. Approximate: the stored record
			// carries a little metadata on top.
			const serialized = "raw" in frame ? frame.raw : JSON.stringify(frame.data ?? null);
			bytes += serialized.length;
			if (bytes > maxBytes) {
				overflowed = true;
				frames.length = 0;
				return;
			}
			frames.push("raw" in frame ? { raw: frame.raw } : { eventName: frame.eventName, data: JSON.parse(serialized) });
		},
		onStreamEnd(info) {
			const finishReason = args.finishReason();
			if (
				overflowed ||
				info.aborted ||
				info.downstreamClosed ||
				args.failed() ||
				frames.length === 0 ||
				finishReason === "error" ||
				finishReason === "cancel"
			) {
				return;
			}
			const record = buildCachedResponseRecord({
				key: cacheState.key!,
				fingerprint: cacheState.fingerprint!,
				endpoint: ctx.endpoint,
				model: ctx.model,
				statusCode: 200,
				responseBody: null,
				streamFrames: frames,
				providerId: result.provider,
				usage: result.bill.usage ?? null,
				currency: result.bill.currency ?? null,
				finishReason,
				nativeResponseId: result.bill.upstream_id ?? null,
				routingMode: ctx.routingMode ?? null,
				presetId: ctx.preset?.id ?? null,
				presetSlug: ctx.preset?.slug ?? null,
				sourceRequestId: ctx.requestId,
				ttlSeconds: cacheState.ttlSeconds!,
			});
			let releaseRuntime: () => void = () => { };
			try {
				releaseRuntime = ensureRuntimeForBackground();
			} catch {
				return;
			}
			dispatchBackground((async () => {
				try {
					await store.set(record.key, record, record.ttlSeconds);
				} catch (error) {
					console.warn("[gateway] response cache stream write failed", {
						requestId: ctx.requestId,
						endpoint: ctx.endpoint,
						error: error instanceof Error ? error.message : String(error),
					});
				} finally {
					releaseRuntime();
				}
			})());
		},
	};
}

// src/lib/gateway/streaming.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Parses SSE frames and accumulates usage.

import type { PipelineContext } from "../before/types";
import type { PriceCard } from "../pricing";
import {
	detectStreamProtocol,
	extractUnifiedStreamEvents,
	type UnifiedStreamEvent,
} from "./stream-events";
import {
	encodeUnifiedStreamEvent,
	type StreamProtocol,
} from "@protocols/stream/encode";
import { dispatchBackground } from "@/runtime/env";
import { getProviderStreamCancellationPolicy } from "./stream-cancellation";
import { readSseEvents, SseProtocolError } from "@core/sse";
import { StreamSession, observeStreamOutcome, type StreamFinalInfo, type StreamOutcome } from "./stream-session";
import { recordStreamObservation } from "@/runtime/request-operations";
import { classifyStreamException, classifyStreamProviderError, type GatewayStreamError } from "@core/stream-error";
import { encodeStreamFailure } from "@protocols/stream/error";

export type { StreamFinalInfo } from "./stream-session";

/** Pure passthrough for non-stream fallbacks (keeps upstream headers where safe). */
export function passthrough(upstream: Response): Response {
    // We do not inject custom headers anymore; keep this as a minimal wrapper.
    return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers, // preserve upstream cache-control/content-type/etc
    });
}

type PassthroughWithPricingOpts = {
    upstream: Response;
    ctx: PipelineContext;
    provider: string;
    credentialSource?: "gateway" | "byok";
    priceCard: PriceCard | null;
    /**
     * Mutate each parsed SSE JSON frame before sending downstream.
     * Return the same object or a new one.
     */
    rewriteFrame?: (frame: any) => any;
    /**
     * Called once at the end with the final usage object from the final snapshot frame.
     * You can compute pricing & persist inside (prefer fire-and-forget in caller).
     */
    onFinalUsage?: (usageRaw: any, info: StreamFinalInfo) => Promise<void> | void;
    /** Shared terminal outcome for health, accounting and audit consumers. */
    onCompletion?: (outcome: StreamOutcome<any>) => Promise<void> | void;
    /**
     * Called once with the final snapshot frame (if detected).
     */
    onFinalSnapshot?: (snapshot: any) => void;
    /**
     * Called for each canonical stream event extracted from protocol frames.
     */
    onStreamEvent?: (event: UnifiedStreamEvent) => void | Promise<void>;
    /**
     * Optional Server-Timing value; if present we'll include it.
     */
    timingHeader?: string;
};

/** Re-stream SSE while:
 *  - parsing each "data:" block as JSON
 *  - rewriting frames (e.g., inject gateway id/provider/nativeResponseId)
 *  - detecting the final snapshot frame with `usage` to trigger onFinalUsage
 */
export async function passthroughWithPricing(opts: PassthroughWithPricingOpts): Promise<Response> {
    return (await createPricedStreamSession(opts)).response;
}

export async function createPricedStreamSession(opts: PassthroughWithPricingOpts): Promise<{
    response: Response;
    session: StreamSession<any>;
}> {
    const { upstream, rewriteFrame, onFinalUsage, onCompletion, onFinalSnapshot, onStreamEvent, timingHeader, ctx, provider } = opts;
    const session = new StreamSession<any>();
    const cancellationPolicy = getProviderStreamCancellationPolicy(provider);
    const providerMetadata = ctx.providers?.find((candidate) => candidate.providerId === provider);
    ctx.meta.streamCancellationSupport =
        providerMetadata?.streamCancellationSupport ?? cancellationPolicy.support;
    ctx.meta.streamProviderBillingOnCancel =
        providerMetadata?.streamCancellationStopsProviderBilling === true
            ? "stops"
            : cancellationPolicy.providerBillingOnCancel;
    // Exact usage recovery is not wired into an adapter yet. Even if catalogue
    // metadata says it exists, keep draining until the resolver is executable.
    ctx.meta.streamDisconnectAction = "drain_upstream";

    const enc = new TextEncoder();

    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    const tStart = performance.now();
    let firstOutputAt: number | null = null;
    let lastOutputFrameAt: number | null = null;
    let outputFrameIntervalTotalMs = 0;
    let outputFrameIntervalCount = 0;
    let downstreamClosed = false;
    let upstreamFailed = false;
    let nextResponseSequence = 0;
    void writer.closed.catch(() => {
        if (upstreamFailed) return;
        downstreamClosed = true;
        session.disconnect();
        ctx.meta.downstreamDisconnected = true;
    });

    const resolveSelectedUpstreamStartMs = () => {
        if (typeof ctx.meta.selectedUpstreamFetchStartMs === "number") {
            return ctx.meta.selectedUpstreamFetchStartMs;
        }
        if (typeof ctx.meta.upstreamStartMs === "number") return ctx.meta.upstreamStartMs;
        return null;
    };

    let completionTimingRecorded = false;
    const recordCompletionTiming = () => {
        if (completionTimingRecorded) return;
        completionTimingRecorded = true;
        if (
            ctx.meta.preserve_stream_timing &&
            typeof ctx.meta.latency_ms === "number" &&
            typeof ctx.meta.generation_ms === "number" &&
            typeof ctx.meta.end_to_end_ms === "number"
        ) {
            return;
        }
        const nowMs = Date.now();
        const nowPerf = performance.now();
        const gatewayStartMs = typeof ctx.meta.startedAtMs === "number"
            ? ctx.meta.startedAtMs
            : null;
        const upstreamStartMs = resolveSelectedUpstreamStartMs();
        ctx.meta.end_to_end_ms = gatewayStartMs !== null
            ? Math.max(0, Math.round(nowMs - gatewayStartMs))
            : Math.max(0, Math.round(nowPerf - tStart));
        ctx.meta.generation_ms = upstreamStartMs !== null
            ? Math.max(0, Math.round(nowMs - upstreamStartMs))
            : firstOutputAt !== null
                ? Math.max(0, Math.round(nowPerf - tStart))
                : 0;
        ctx.meta.phaseo_overhead_ms = Math.max(
            0,
            ctx.meta.end_to_end_ms - ctx.meta.generation_ms,
        );
    };

    const writeFrame = async (frame: string) => {
        if (downstreamClosed) return false;
        const bytes = enc.encode(frame);
        try {
            await writer.write(bytes);
            session.delivered(bytes.byteLength);
            return true;
        } catch {
            downstreamClosed = true;
            session.disconnect();
            ctx.meta.downstreamDisconnected = true;
            return false;
        }
    };
    // Write one SSE JSON object as "event: X\ndata: {...}\n\n" (event optional).
    const writeJson = (obj: unknown, eventName?: string | null) =>
        writeFrame(`${eventName ? `event: ${eventName}\n` : ""}data: ${JSON.stringify(obj)}\n\n`);

    if (onFinalUsage || onCompletion) dispatchBackground(session.completion.then(async outcome => {
        const { usage, finalInfo: info } = outcome;
        if (info.aborted) {
            console.warn("[gateway] Streaming response did not finish successfully", {
                requestId: ctx.requestId,
                workspaceId: ctx.workspaceId,
                endpoint: ctx.endpoint,
                provider,
                failureOrigin: info.failureOrigin ?? null,
            });
        } else if (!info.sawFinalUsage) {
            console.warn("[gateway] Streaming response completed without final usage", {
                requestId: ctx.requestId,
                workspaceId: ctx.workspaceId,
                endpoint: ctx.endpoint,
                provider,
            });
        }

        // Consumers observe the same settled outcome; a consumer failure cannot
        // rewrite it or prevent another registered consumer from running.
        await Promise.all([
            onFinalUsage && Promise.resolve().then(() => onFinalUsage(usage, info)),
            onCompletion && Promise.resolve().then(() => onCompletion(outcome)),
        ].map(task => Promise.resolve(task).catch((err) => {
                console.error("passthroughWithPricing onFinalUsage error:", err, {
                    requestId: ctx.requestId,
                    workspaceId: ctx.workspaceId,
                });
            })));
    }));

    const streamPump = (async () => {
        if (!upstream.body) {
            recordCompletionTiming();
            recordStreamObservation(observeStreamOutcome(session.finish(null, { aborted: true, sawFinalUsage: false }, classifyStreamException(null, "provider"))));
            try { await writer.close(); } catch { }
            return;
        }

        let sawTerminalSnapshot = false;
        let sawWireTerminal = false;
        let lastSeenUsage: any = null;
        let finalUsageCandidate: any = null;
        let failure: unknown;
        let failed = false;
        let streamError: GatewayStreamError | null = null;
        let emittedFailure = false;
        let failureOrigin: "provider" | "gateway" = "provider";
        let chunkReceivedAt = performance.now();

        try {
            for await (const parsed of readSseEvents(upstream.body, { onChunk: time => { chunkReceivedAt = time; } })) {
                    failureOrigin = "gateway";
                    const frameReceivedAt = chunkReceivedAt;
                    const dataStr = parsed.data;
                    const eventName = parsed.event ?? null;
                    if (!dataStr) { failureOrigin = "provider"; continue; }
                    if (dataStr === "[DONE]") {
                        sawWireTerminal = true;
                        if (!downstreamClosed && ctx.protocol === "openai.chat.completions") {
                            await writeFrame("data: [DONE]\n\n");
                        }
                        break;
                    }

                    let json: any;
                    try {
                        json = JSON.parse(dataStr);
                    } catch {
                        failureOrigin = "provider";
                        throw new SseProtocolError("sse_invalid_json");
                    }

                    const events = extractUnifiedStreamEvents({
                        protocol: ctx.protocol,
                        eventName,
                        frame: json,
                    });
                    const errorEvent = events.find(event => event.type === "error"
                        || (event.type === "snapshot" && String(event.payload?.status).toLowerCase() === "failed")
                        || (event.type === "stop" && ["error", "failed", "failure", "upstream_failure"].includes(String(event.finishReason).toLowerCase())));
                    if (errorEvent && !streamError) streamError = classifyStreamProviderError(errorEvent.payload ?? json, opts.credentialSource);
                    const containsGeneratedOutput = events.some((event) =>
                        (event.type === "delta_text" && event.text.length > 0) ||
                        (event.type === "delta_tool" && Boolean(
                            event.argumentsDelta || event.arguments || event.toolName,
                        )) ||
                        event.type === "delta_content_part"
                    );
                    if (containsGeneratedOutput) session.observeOutput(frameReceivedAt);
                    for (const event of events) if (event.type === "stop") session.observeStop(event.finishReason);
                    const detectedProtocol = detectStreamProtocol({
                        protocol: undefined,
                        eventName,
                        frame: json,
                    });
                    const targetProtocol: StreamProtocol | null =
                        ctx.protocol === "openai.chat.completions" ||
                        ctx.protocol === "openai.responses" ||
                        ctx.protocol === "anthropic.messages"
                            ? ctx.protocol
                            : null;
                    if (onStreamEvent && events.length > 0) {
                        for (const event of events) {
                                const observed = onStreamEvent(event);
                                if (observed && typeof (observed as Promise<void>).then === "function") {
                                    await observed;
                                }
                        }
                    }

                    const usageFromEvents =
                        events
                            .slice()
                            .reverse()
                            .find((event) => event.type === "usage")?.usage ?? null;
                    if (usageFromEvents) {
                        lastSeenUsage = usageFromEvents;
                    }

                    const finalSnapshotFromEvents =
                        events.find((event) => event.type === "snapshot" && event.isFinal)
                            ?.payload ?? null;
                    const terminalByEvents = events.some(
                        (event) =>
                            event.type === "stop" ||
                            (event.type === "snapshot" && event.isFinal),
                    );
                    const usageCandidate = usageFromEvents ?? json?.usage ?? json?.response?.usage ?? null;

                    const fallbackTerminal =
                        !terminalByEvents &&
                        !sawTerminalSnapshot &&
                        (
                            json?.object === "chat.completion" ||
                            json?.response?.object === "chat.completion" ||
                            (json?.object === "response" && json?.status === "completed") ||
                            (json?.response?.object === "response" && json?.response?.status === "completed")
                        );

                    const isFinalSnapshot = !sawTerminalSnapshot && (terminalByEvents || fallbackTerminal);

                    if (isFinalSnapshot) {
                        sawTerminalSnapshot = true;
                        recordCompletionTiming();
                    }

                    const shouldReencode =
                        Boolean(targetProtocol) &&
                        Boolean(detectedProtocol) &&
                        targetProtocol !== detectedProtocol &&
                        events.length > 0;

                    const outboundFrames: Array<{ eventName?: string | null; frame: any }> = shouldReencode
                        ? events
                            .map((event) =>
                                encodeUnifiedStreamEvent(targetProtocol as StreamProtocol, event, {
                                    requestId: ctx.requestId,
                                    model: ctx.model,
                                }),
                            )
                            .filter((entry): entry is { eventName?: string | null; frame: Record<string, any> } => Boolean(entry))
                        : [{ eventName, frame: json }];

                    let finalUsageAfterWrite: any = null;
                    // Capture terminal state before rewriting the frame, but do not
                    // start persistence until the terminal frame is downstream.
                    // OpenAI chat streams emit finish_reason first and then a
                    // separate usage-only frame, so a terminal frame without usage
                    // must not settle billing before that trailing frame arrives.
                    if (isFinalSnapshot) {
                        if (onFinalSnapshot) {
                            onFinalSnapshot(finalSnapshotFromEvents ?? json);
                        }
                        finalUsageAfterWrite = usageCandidate ?? lastSeenUsage;
                    } else if (sawTerminalSnapshot && usageCandidate) {
                        finalUsageAfterWrite = usageCandidate;
                    }

                    if (containsGeneratedOutput && !ctx.meta.preserve_stream_timing) {
                        if (lastOutputFrameAt !== null) {
                            const intervalMs = frameReceivedAt - lastOutputFrameAt;
                            if (Number.isFinite(intervalMs) && intervalMs > 0) {
                                outputFrameIntervalTotalMs += intervalMs;
                                outputFrameIntervalCount += 1;
                                ctx.meta.itl_ms =
                                    outputFrameIntervalTotalMs / outputFrameIntervalCount;
                            }
                        }
                        lastOutputFrameAt = frameReceivedAt;
                    }

                    if (firstOutputAt === null && containsGeneratedOutput) {
                        firstOutputAt = frameReceivedAt;
                        const firstOutputAtMs = Date.now();
                        if (!ctx.meta.preserve_stream_timing) {
                            const upstreamStartMs = resolveSelectedUpstreamStartMs();
                            const gatewayStartMs = typeof ctx.meta.startedAtMs === "number"
                                ? ctx.meta.startedAtMs
                                : null;
                            if (upstreamStartMs !== null) {
                                // Date.now() has millisecond precision. A content frame that
                                // lands in the same tick is still a real, positive observation.
                                const providerTtftMs = Math.max(
                                    1,
                                    Math.round(firstOutputAtMs - upstreamStartMs),
                                );
                                ctx.meta.provider_ttft_ms = providerTtftMs;
                                ctx.meta.latency_ms = providerTtftMs;
                            } else {
                                // A post-headers stream timestamp is not provider TTFT. Leave
                                // the metric absent unless the selected dispatch clock exists.
                                delete ctx.meta.provider_ttft_ms;
                                delete ctx.meta.latency_ms;
                            }
                            if (gatewayStartMs !== null) {
                                ctx.meta.gateway_ttft_ms = Math.max(
                                    1,
                                    Math.round(firstOutputAtMs - gatewayStartMs),
                                );
                            } else {
                                delete ctx.meta.gateway_ttft_ms;
                            }
                        }
                    }

                    // Capture arrival timing before response rewriting and downstream writes;
                    // neither transform work nor client backpressure belongs in provider TTFT.
                    for (const outbound of outboundFrames) {
                        let frameOut: any = outbound.frame;
                        if (rewriteFrame) {
                            frameOut = rewriteFrame(frameOut) ?? frameOut;
                        }
                        await writeJson(frameOut, outbound.eventName ?? null);
                        if (ctx.protocol === "openai.responses") {
                            const sequence = frameOut?.sequence_number;
                            nextResponseSequence = Number.isSafeInteger(sequence) && sequence >= nextResponseSequence
                                ? sequence + 1 : nextResponseSequence + 1;
                        }
                    }

                    if (finalUsageAfterWrite) {
                        finalUsageCandidate = finalUsageAfterWrite;
                    }
                    const nativeType = eventName ?? json?.type;
                    const nativeTerminal = ["response.completed", "response.incomplete", "response.failed", "message_stop", "error"].includes(nativeType)
                        || json?.object === "error" || (json?.error && typeof json.error === "object") || json?.object === "chat.completion"
                        || (json?.object === "response" && ["completed", "incomplete", "failed"].includes(json?.status));
                    if (nativeTerminal) {
                        sawWireTerminal = true;
                        // Compatibility adapters may finish with a full Chat snapshot.
                        // It is authoritative, but Chat SSE clients still need DONE.
                        // Stop here so an upstream marker cannot be forwarded twice.
                        if (json?.object === "chat.completion" && ctx.protocol === "openai.chat.completions" && !downstreamClosed) {
                            await writeFrame("data: [DONE]\n\n");
                        }
                        break;
                    }
                    failureOrigin = "provider";
            }
            if (!sawWireTerminal) { failureOrigin = "provider"; throw new SseProtocolError("sse_missing_terminal"); }
        } catch (error) {
            failed = true;
            upstreamFailed = true;
            failure = error;
            streamError = classifyStreamException(error, failureOrigin);
            failureOrigin = streamError.origin === "gateway" ? "gateway" : "provider";
            // Once data has reached the client there is no provider fallback.
            // End in its native error shape; never synthesize successful DONE/stop.
            if (session.committed && !downstreamClosed && ["openai.chat.completions", "openai.responses", "anthropic.messages"].includes(ctx.protocol)) {
                const encoded = encodeStreamFailure(ctx.protocol as StreamProtocol, streamError, nextResponseSequence);
                emittedFailure = await writeJson(encoded.frame, encoded.eventName);
            }
        } finally {
            recordCompletionTiming();
            const outcome = session.finish(finalUsageCandidate ?? lastSeenUsage, {
                    aborted: failed || !sawWireTerminal,
                    sawFinalUsage: !failed && sawWireTerminal && Boolean(finalUsageCandidate ?? lastSeenUsage),
                    ...(failed ? { failureOrigin } : {}),
                }, streamError);
            recordStreamObservation(observeStreamOutcome(outcome));
            if (!downstreamClosed) {
                try {
                    if (failed && !emittedFailure) await writer.abort(failure);
                    else await writer.close();
                } catch { }
            }
        }
    })();
    dispatchBackground(streamPump.catch(err => {
        console.error("passthroughWithPricing stream error:", err, {
            requestId: ctx.requestId,
            workspaceId: ctx.workspaceId,
        });
    }));

    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-store");
    if (timingHeader) {
        headers.set("Server-Timing", timingHeader);
        headers.set("Timing-Allow-Origin", "*");
    }

    // Do not add custom gateway headers; everything important is in-body now.
    return { response: new Response(ts.readable, { status: upstream.status, headers }), session };
}

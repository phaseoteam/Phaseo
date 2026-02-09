// src/lib/gateway/streaming.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Parses SSE frames and accumulates usage.

import type { PipelineContext } from "../before/types";
import type { PriceCard } from "../pricing";

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
    onFinalUsage?: (usageRaw: any, info: { aborted: boolean; sawFinalUsage: boolean }) => Promise<void> | void;
    /**
     * Called once with the final snapshot frame (if detected).
     */
    onFinalSnapshot?: (snapshot: any) => void;
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
    const { upstream, rewriteFrame, onFinalUsage, onFinalSnapshot, timingHeader, ctx, provider } = opts;

    const reader = upstream.body?.getReader();
    const dec = new TextDecoder();
    const enc = new TextEncoder();

    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    const tStart = performance.now();
    let firstFrameAt: number | null = null;
    let firstFrameAtMs: number | null = null;
    let downstreamClosed = false;

    // Write one SSE JSON object as "event: X\ndata: {...}\n\n" (event optional)
    const writeJson = async (obj: unknown, eventName?: string | null) => {
        if (downstreamClosed) return;
        const prefix = eventName ? `event: ${eventName}\n` : "";
        const line = `${prefix}data: ${JSON.stringify(obj)}\n\n`;
        try {
            await writer.write(enc.encode(line));
        } catch {
            downstreamClosed = true;
        }
    };

    let finalUsageSettled = false;
    const finalizeUsage = async (usage: any, reason: "complete" | "aborted") => {
        if (finalUsageSettled) return;
        finalUsageSettled = true;

        if (!onFinalUsage) return;

        if (reason === "aborted") {
            console.warn("[gateway] Streaming response ended before final usage", {
                requestId: ctx.requestId,
                teamId: ctx.teamId,
                endpoint: ctx.endpoint,
                provider,
            });
        }

        try {
            if (firstFrameAt !== null && typeof ctx.meta.generation_ms !== "number") {
                ctx.meta.generation_ms = Math.round(performance.now() - firstFrameAt);
            }
            await onFinalUsage(usage, {
                aborted: reason === "aborted",
                sawFinalUsage: reason === "complete",
            });
        } catch (err) {
            console.error("passthroughWithPricing onFinalUsage error:", err, {
                requestId: ctx.requestId,
                teamId: ctx.teamId,
            });
        }
    };

    (async () => {
        if (!reader) {
            await finalizeUsage(null, "aborted");
            try { await writer.close(); } catch { }
            return;
        }

        let buf = "";
        let sawFinalUsage = false;

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buf += dec.decode(value, { stream: true });

                // Split on SSE frame boundary
                const frames = buf.split(/\n\n/);
                buf = frames.pop() ?? "";

                for (const raw of frames) {
                    // SSE fields - capture event name and data payload
                    let dataStr = "";
                    let eventName: string | null = null;
                    for (const line of raw.split(/\n/)) {
                        const l = line.replace(/\r$/, "");
                        if (l.startsWith("event:")) eventName = l.slice(6).trim();
                        if (l.startsWith("data:")) dataStr += l.slice(5).trimStart();
                        // Keep ignoring "id:" etc - we preserve event when present
                    }
                    if (!dataStr) continue;

                    let json: any;
                    try {
                        json = JSON.parse(dataStr);
                    } catch {
                        // not JSON - just forward raw block
                        if (!downstreamClosed) {
                            try {
                                await writer.write(enc.encode(raw + "\n\n"));
                            } catch {
                                downstreamClosed = true;
                            }
                        }
                        continue;
                    }

                    if (firstFrameAt === null) {
                        firstFrameAt = performance.now();
                        firstFrameAtMs = Date.now();
                        if (typeof ctx.meta.latency_ms !== "number") {
                            if (typeof ctx.meta.upstreamStartMs === "number") {
                                ctx.meta.latency_ms = Math.round(firstFrameAtMs - ctx.meta.upstreamStartMs);
                            } else {
                                ctx.meta.latency_ms = Math.round(firstFrameAt - tStart);
                            }
                        }
                    }

                    const usageCandidate = json?.usage ?? json?.response?.usage ?? null;
                    const isFinalSnapshot = !sawFinalUsage && (
                        json?.object === "chat.completion" ||
                        json?.object === "response" ||
                        usageCandidate
                    );

                    if (isFinalSnapshot) {
                        sawFinalUsage = true;
            if (typeof ctx.meta.generation_ms !== "number") {
                if (typeof ctx.meta.upstreamStartMs === "number") {
                    ctx.meta.generation_ms = Math.round(Date.now() - ctx.meta.upstreamStartMs);
                } else if (firstFrameAt !== null) {
                    ctx.meta.generation_ms = Math.round(performance.now() - firstFrameAt);
                }
            }
                    }

                    // Allow caller to enrich the frame (gateway id/provider/nativeResponseId)
                    if (rewriteFrame) {
                        try { json = rewriteFrame(json) ?? json; } catch { }
                    }

                    // Detect final snapshot to extract usage for billing   
                    if (isFinalSnapshot) {
                        if (onFinalSnapshot) {
                            try { onFinalSnapshot(json); } catch { }
                        }
                        await finalizeUsage(usageCandidate, "complete");    
                    }

                    await writeJson(json, eventName);
                }
            }
        } finally {
            if (!sawFinalUsage) {
                await finalizeUsage(null, "aborted");
            }
            if (!downstreamClosed) {
                try { await writer.close(); } catch { }
            }
        }
    })().catch(err => {
        console.error("passthroughWithPricing stream error:", err, {
            requestId: ctx.requestId,
            teamId: ctx.teamId,
        });
    });

    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-store");
    if (timingHeader) {
        headers.set("Server-Timing", timingHeader);
        headers.set("Timing-Allow-Origin", "*");
    }

    // Do not add custom gateway headers; everything important is in-body now.
    return new Response(ts.readable, { status: upstream.status, headers });
}











import { readSseEvents } from "@core/sse";
import { classifyStreamException, classifyStreamProviderError, type GatewayStreamError } from "@core/stream-error";
import type { EventSourceMessage } from "eventsource-parser";

const MAX_PREFIX_BYTES = 64 * 1024;
const MAX_PREFIX_EVENTS = 16;
const LOOKAHEAD_MS = 100;
const encoder = new TextEncoder();

function encode(event: EventSourceMessage): Uint8Array {
    return encoder.encode(`${event.event ? `event: ${event.event}\n` : ""}${event.id ? `id: ${event.id}\n` : ""}${event.data.split("\n").map(line => `data: ${line}\n`).join("")}\n`);
}

function isPreamble(frame: any): boolean {
    if (frame?.type === "ping") return true;
    if (frame?.type === "response.created" || frame?.type === "response.in_progress") {
        return Array.isArray(frame.response?.output) && frame.response.output.length === 0;
    }
    if (frame?.type === "message_start") return Array.isArray(frame.message?.content) && frame.message.content.length === 0;
    // Only an empty role delta is metadata. Tools, reasoning, text, finish and
    // unknown extensions establish readiness immediately; never hide output.
    return frame?.object === "chat.completion.chunk" && Array.isArray(frame.choices) && frame.choices.length > 0
        && frame.choices.every((choice: any) => choice.finish_reason == null && choice.delta?.role === "assistant"
            && Object.keys(choice.delta).every(key => key === "role" || (key === "content" && choice.delta.content === "")));
}

/** Do not infer zero from a placeholder Bill, a missing total, or a partial
 * Anthropic message_start usage. Require an explicit complete zero vector. */
export function hasExplicitZeroUsage(usage: any): boolean {
    if (!usage || typeof usage !== "object" || Array.isArray(usage) || usage.total_tokens !== 0) return false;
    if (!((usage.input_tokens === 0 && usage.output_tokens === 0)
        || (usage.prompt_tokens === 0 && usage.completion_tokens === 0))) return false;
    return containsOnlyZeroUsage(usage);
}

function containsOnlyZeroUsage(usage: unknown): boolean {
    const pending: unknown[] = [usage];
    let visited = 0;
    while (pending.length) {
        if (++visited > 128) return false;
        const value = pending.pop();
        if (value === null) continue;
        if (typeof value === "number") { if (value !== 0) return false; }
        else if (typeof value === "object" && !Array.isArray(value)) {
            const values = Object.values(value as object);
            if (values.length + pending.length + visited > 128) return false;
            for (const entry of values) pending.push(entry);
        }
        else return false;
    }
    return true;
}

/** A bounded lookahead, not a second accounting reader/tee. It never delivers
 * bytes to a client. A slow provider keeps its pending read and normal stream;
 * the deadline is NOT a provider timeout and never authorizes another attempt. */
export async function prepareStreamAdmission(source: ReadableStream<Uint8Array>, credentialSource?: "gateway" | "byok") {
    const abort = new AbortController();
    const iterator = readSseEvents(source, { signal: abort.signal });
    type Next = { value: IteratorResult<EventSourceMessage> } | { error: unknown };
    const next = (): Promise<Next> => iterator.next().then(value => ({ value }), error => ({ error }));
    const prefix: Uint8Array[] = [];
    let prefixBytes = 0;
    let pending: Promise<Next> | undefined;
    let failure: GatewayStreamError | null = null;
    let readFailure: unknown;
    let failedRead = false;
    let ended = false;
    let zeroUsage = false;
    let priorUsageCompatible = true;
    const deadline = Symbol("deadline");
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<typeof deadline>(resolve => { timer = setTimeout(() => resolve(deadline), LOOKAHEAD_MS); });
    try {
        while (prefix.length < MAX_PREFIX_EVENTS && prefixBytes < MAX_PREFIX_BYTES) {
            pending = next();
            const result = await Promise.race([pending, timeout]);
            if (result === deadline) break;
            pending = undefined;
            if ("error" in result) {
                failedRead = true; readFailure = result.error;
                failure = classifyStreamException(result.error, "provider"); zeroUsage = false;
                break;
            }
            if (result.value.done) { ended = true; break; }
            const event = result.value.value;
            const bytes = encode(event);
            prefix.push(bytes); prefixBytes += bytes.byteLength;
            if (event.data === "[DONE]") { if (!failure) break; continue; }
            let frame: any;
            try { frame = JSON.parse(event.data); }
            catch { break; } // Existing stream owner classifies malformed frames.
            if (failure) { zeroUsage = false; break; } // Conflicting trailing evidence.
            if (frame?.error || frame?.type === "error" || frame?.type === "response.failed" || frame?.response?.error) {
                failure = classifyStreamProviderError(frame, credentialSource);
                zeroUsage = priorUsageCompatible && hasExplicitZeroUsage(frame.usage ?? frame.response?.usage);
                // Observe EOF before considering a terminal zero-usage failure replayable.
                continue;
            }
            if (!isPreamble(frame)) break;
            const usage = frame.usage ?? frame.response?.usage ?? frame.message?.usage;
            if (usage !== undefined && !containsOnlyZeroUsage(usage)) priorUsageCompatible = false;
        }
    } finally { clearTimeout(timer!); }

    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                if (prefix.length) { controller.enqueue(prefix.shift()!); return; }
                if (failedRead) throw readFailure;
                if (ended) { controller.close(); return; }
                const result = await (pending ?? next()); pending = undefined;
                if ("error" in result) throw result.error;
                if (result.value.done) { ended = true; controller.close(); }
                else controller.enqueue(encode(result.value.value));
            } catch (error) {
                controller.error(error);
                await iterator.return(undefined).catch(() => undefined);
            }
        },
        async cancel(reason) {
            abort.abort(reason);
            await iterator.return(undefined).catch(() => undefined);
        },
    }, { highWaterMark: 0 });
    return { stream, failure, retryableZeroUsage: ended && zeroUsage && failure?.retryable === true };
}

/** Financial scope for this first rollout: pure text and token-only pricing.
 * Tool side effects, fixed fees, absent pricing and unknown usage cannot replay. */
export function supportsZeroUsageReplay(ir: any, priceCard: any): boolean {
    return (!ir.tools || (Array.isArray(ir.tools) && ir.tools.length === 0))
        && Array.isArray(ir.messages) && ir.messages.every((message: any) =>
            message.role !== "tool" && Array.isArray(message.content) && message.content.every((part: any) => part.type === "text"))
        && Array.isArray(priceCard?.rules) && priceCard.rules.length > 0
        && priceCard.rules.every((rule: any) => typeof rule.meter === "string" && rule.meter.endsWith("_tokens"));
}

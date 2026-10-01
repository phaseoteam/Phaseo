import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createPricedStreamSession } from "./streaming";
import { GatewayStreamError } from "@core/stream-error";
import { readSseEvents } from "@core/sse";

const frames = {
    "openai.chat.completions": { object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "partial" } }] },
    "openai.responses": { type: "response.created", sequence_number: 41, response: { id: "test", object: "response", status: "in_progress", output: [] } },
    "anthropic.messages": { type: "message_start", message: { id: "test", type: "message", role: "assistant", model: "test", content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
};
type Protocol = keyof typeof frames;

async function brokenStream(protocol: Protocol, gateway = false) {
    const payload = frames[protocol];
    const event = "type" in payload ? `event: ${payload.type}\n` : "";
    let sent = false;
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
        if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode(`${event}data: ${JSON.stringify(payload)}\n\n`)); }
        else controller.error(gateway ? new GatewayStreamError("gateway", "transform", "gateway_stream_transform_failed") : new Error("secret provider exception"));
    } });
    return createPricedStreamSession({ upstream: new Response(body), provider: "poolside", priceCard: null,
        ctx: { protocol, requestId: "test", workspaceId: "test", meta: {} } as any });
}

describe("native post-commit stream failures", () => {
    it.each(Object.keys(frames) as Protocol[])("emits one native error for %s", async protocol => {
        const { response, session } = await brokenStream(protocol);
        const parsed = [];
        for await (const event of readSseEvents(response.body!)) parsed.push({ event: event.event, frame: JSON.parse(event.data) });
        expect(parsed).toHaveLength(2);
        const failure = parsed[1]!;
        if (protocol === "openai.responses") expect(failure).toEqual({ event: "error", frame: {
            type: "error", code: "upstream_stream_failure", message: expect.any(String), param: null, sequence_number: 42,
        } });
        else if (protocol === "anthropic.messages") expect(failure).toMatchObject({ event: "error", frame: { type: "error", error: { type: "api_error" } } });
        else expect(failure.frame).toMatchObject({ error: { type: "server_error", code: "upstream_stream_failure" } });
        expect(JSON.stringify(parsed)).not.toContain("secret");
        expect(await session.completion).toMatchObject({ state: "FAILED", committed: true,
            error: { origin: "provider", healthImpact: "failure", kind: "transport" } });
    });

    it("preserves a gateway error through an adapter read without poisoning provider health", async () => {
        const { response, session } = await brokenStream("openai.chat.completions", true);
        expect(await response.text()).toContain("gateway_stream_transform_failed");
        expect(await session.completion).toMatchObject({ state: "FAILED", error: { origin: "gateway", healthImpact: "neutral" },
            finalInfo: { aborted: true, failureOrigin: "gateway" } });
    });

    it("the OpenAI Chat SDK throws the native error after yielding partial output", async () => {
        const { response, session } = await brokenStream("openai.chat.completions");
        const fetch = vi.fn(async () => response);
        const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch });
        const seen = [];
        await expect((async () => {
            const stream = await client.chat.completions.create({ model: "test", messages: [], stream: true });
            for await (const frame of stream) seen.push(frame);
        })()).rejects.toMatchObject({ code: "upstream_stream_failure" });
        expect(seen).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(1);
        expect((await session.completion).state).toBe("FAILED");
    });

    it("the OpenAI Responses SDK receives a typed error with an increasing sequence", async () => {
        const { response } = await brokenStream("openai.responses");
        const fetch = vi.fn(async () => response);
        const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch });
        const stream = await client.responses.create({ model: "test", input: "test", stream: true });
        const seen = []; for await (const frame of stream) seen.push(frame);
        expect(seen).toHaveLength(2);
        expect(seen[1]).toMatchObject({ type: "error", code: "upstream_stream_failure", sequence_number: 42 });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("the Anthropic SDK throws the native error rather than returning successful completion", async () => {
        const { response, session } = await brokenStream("anthropic.messages");
        const fetch = vi.fn(async () => response);
        const client = new Anthropic({ apiKey: "test-only", maxRetries: 0, fetch });
        const stream = client.messages.stream({ model: "test", messages: [], max_tokens: 16 });
        await expect(stream.finalMessage()).rejects.toThrow("The upstream stream failed before successful completion.");
        expect(fetch).toHaveBeenCalledTimes(1); expect((await session.completion).state).toBe("FAILED");
    });
});

// A streamed server-tool request that fails after charging completed rounds sends that usage before
// its terminal error. The frames go through the official SDK stream accumulators, as clients read
// them: a frame-shape mistake there (a message_delta without delta, a failed Response without
// output) throws inside the SDK before the client sees the usage or the error.
import { describe, expect, it } from "vitest";
import { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { accumulateResponse } from "openai/lib/responses/ResponseAccumulator";
import { addOutputText } from "openai/lib/ResponsesParser";
import { createManagedToolLiveResponse } from "./server-tools.live";

const CHARGED = { input_tokens: 1_000, output_tokens: 100, total_tokens: 1_100, cost: 0.0014, pricing: { total_nanos: 1_400_000 } };

async function liveFailure(protocol: "openai.chat.completions" | "openai.responses" | "anthropic.messages") {
	const response = await createManagedToolLiveResponse({
		protocol,
		requestId: "req_live_failure",
		model: "openai/gpt-5.4-nano",
		run: async (sink) => {
			// Round 1 streams text and completes; the final round is an empty response.
			const emit = sink.beginRound();
			emit({ type: "delta_text", channel: "output_text", text: "Checking.", choiceIndex: 0 });
			return new Response(JSON.stringify({ error: "empty_response" }), { status: 502 });
		},
		chargedUsage: () => CHARGED,
	});
	const text = await response.text();
	return text.split("\n\n").filter(Boolean).flatMap((block) => {
		const data = block.match(/^data: (.+)$/m)?.[1];
		return data && data !== "[DONE]" ? [{ event: block.match(/^event: (.+)$/m)?.[1] ?? null, data: JSON.parse(data) }] : [];
	});
}

/** The SDKs' fromReadableStream reads one JSON event per line. */
function ndjson(payloads: unknown[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const payload of payloads) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
			controller.close();
		},
	});
}

describe("the usage of a charged failure, through the official SDK accumulators", () => {
	it("Chat: a usage chunk with the settled pricing, then the error", async () => {
		const frames = await liveFailure("openai.chat.completions");
		const usageAt = frames.findIndex((frame) => frame.data.usage?.pricing?.total_nanos === 1_400_000);
		expect(usageAt).toBeGreaterThanOrEqual(0);
		expect(frames.findIndex((frame) => frame.data.error)).toBeGreaterThan(usageAt);
	});

	it("Messages: the Anthropic SDK reads the usage message_delta, then the error", async () => {
		const frames = await liveFailure("anthropic.messages");
		const usageFrame = frames.find((frame) => frame.data.type === "message_delta" && frame.data.usage);
		// Before: no delta, so MessageStream threw "Cannot read properties of undefined (reading 'stop_reason')".
		expect(usageFrame?.data).toMatchObject({ delta: { stop_reason: null, stop_sequence: null }, usage: { output_tokens: 100 } });
		expect(frames.findIndex((frame) => frame.data.type === "error")).toBeGreaterThan(frames.indexOf(usageFrame!));

		const stream = MessageStream.fromReadableStream(ndjson(frames.filter((frame) => frame.data.type !== "error").map((frame) => frame.data)));
		let seenOutputTokens: number | null = null;
		stream.on("streamEvent", (event, snapshot) => {
			if (event.type === "message_delta") seenOutputTokens = snapshot.usage.output_tokens;
		});
		const errors: unknown[] = [];
		stream.on("error", (error) => errors.push(error));
		await stream.done().catch((error: unknown) => errors.push(error));
		expect(errors.filter((error) => error instanceof TypeError)).toEqual([]);
		expect(seenOutputTokens).toBe(100);
	});

	it("Responses: a complete failed Response the OpenAI SDK accumulates, with the output so far and the usage", async () => {
		const frames = await liveFailure("openai.responses");
		const failed = frames.find((frame) => frame.event === "response.failed");
		expect(failed?.data.response).toMatchObject({
			id: "req_live_failure", object: "response", model: "openai/gpt-5.4-nano", status: "failed",
			error: { code: "server_error" }, created_at: expect.any(Number), usage: { pricing: { total_nanos: 1_400_000 } },
		});
		expect(frames.findIndex((frame) => frame.event === "error")).toBeGreaterThan(frames.indexOf(failed!));

		// The SDK's own accumulator over every event, then its final-response handling.
		let snapshot: any;
		for (const frame of frames) {
			if (frame.event === "error") continue;
			snapshot = accumulateResponse({ type: frame.event, ...frame.data } as any, snapshot);
		}
		const finalResponse = structuredClone(failed!.data.response);
		// Before: no output, so this threw "rsp.output is not iterable".
		expect(() => addOutputText(finalResponse)).not.toThrow();
		expect(finalResponse.output_text).toBe("Checking.");
		expect(snapshot.output).toEqual([expect.objectContaining({ type: "message" })]);
	});
});

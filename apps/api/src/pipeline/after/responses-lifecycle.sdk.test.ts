// Every Responses lifecycle event (created, in_progress, completed, failed) carries a complete
// Response object: the OpenAI SDKs validate it, and OpenAI Python with strict validation rejects a
// stream whose response.created lacks a required field. The required fields are read from the
// installed SDK's own Response type, so a field the SDK starts requiring fails here.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../audit", () => ({ auditSuccess: vi.fn(), auditFailure: vi.fn() }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn() }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: vi.fn(async () => undefined) }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: vi.fn() }));
vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(),
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { void promise.catch(() => {}); },
}));

import { accumulateResponse } from "openai/lib/responses/ResponseAccumulator";
import { addOutputText } from "openai/lib/ResponsesParser";
import { handleStreamResponse } from "./stream";
import { presentUsageForClient } from "./payload";
import { createManagedToolLiveResponse } from "../surfaces/server-tools.live";
import { setupTestRuntime } from "../../../tests/helpers/runtime";

/** The required (non-optional) fields of the installed openai SDK's Response interface. */
function requiredResponseFields(): string[] {
	const require = createRequire(import.meta.url);
	const declarations = readFileSync(require.resolve("openai/resources/responses/responses").replace(/\.js$/, ".d.ts"), "utf8");
	const body = declarations.slice(declarations.indexOf("export interface Response {"));
	const fields = [...body.slice(0, body.indexOf("\n}")).matchAll(/^ {4}([a-z_]+):/gm)].map((match) => match[1]!);
	// output_text is a convenience property the SDK adds itself (addOutputText), not a wire field.
	return fields.filter((field) => field !== "output_text");
}

const REQUEST = {
	model: "openai/gpt-5.4-nano",
	input: "What time is it?",
	stream: true,
	instructions: "Be brief.",
	parallel_tool_calls: false,
	tool_choice: "auto",
	tools: [
		{ type: "function", name: "lookup", parameters: { type: "object", properties: {} } },
		{ type: "phaseo:web_search" },
	],
};

type Frame = { event: string | null; data: any };
const parse = (text: string): Frame[] => text.split("\n\n").filter(Boolean).flatMap((block) => {
	const data = block.match(/^data: (.+)$/m)?.[1];
	return data && data !== "[DONE]" ? [{ event: block.match(/^event: (.+)$/m)?.[1] ?? null, data: JSON.parse(data) }] : [];
});
const lifecycle = (frames: Frame[]) => frames.filter((frame) => /^response\.(created|queued|in_progress|completed|failed|incomplete)$/.test(frame.event ?? ""));

function expectCompleteResponses(frames: Frame[]) {
	const required = requiredResponseFields();
	expect(required).toEqual(expect.arrayContaining(["parallel_tool_calls", "tool_choice", "tools", "output", "created_at"]));
	expect(lifecycle(frames).length).toBeGreaterThanOrEqual(2);
	for (const frame of lifecycle(frames)) {
		const missing = required.filter((field) => !(field in frame.data.response));
		// Before: response.created had only id, object, model and status.
		expect({ event: frame.event, missing }).toEqual({ event: frame.event, missing: [] });
		expect(frame.data.response).toMatchObject({
			object: "response", instructions: "Be brief.", parallel_tool_calls: false, tool_choice: "auto",
			// The client's function tool, as the API reports it; a gateway server tool is not a Response tool.
			tools: [{ type: "function", name: "lookup", description: null, parameters: { type: "object", properties: {} }, strict: null }],
		});
		expect(Array.isArray(frame.data.response.output)).toBe(true);
		// The SDKs require both usage detail objects (OpenAI Python strict: cached_tokens, cache_write_tokens, reasoning_tokens).
		if (frame.data.response.usage) {
			expect(frame.data.response.usage).toMatchObject({
				input_tokens_details: { cached_tokens: expect.any(Number), cache_write_tokens: expect.any(Number) },
				output_tokens_details: { reasoning_tokens: expect.any(Number) },
			});
		}
	}
}

/** The OpenAI SDK's accumulator over the stream, then its final-response handling. */
function accumulate(frames: Frame[]) {
	let snapshot: any;
	for (const frame of frames) {
		if (!frame.event || frame.event === "error") continue;
		snapshot = accumulateResponse({ type: frame.event, ...frame.data } as any, snapshot);
	}
	const final = structuredClone(lifecycle(frames).at(-1)!.data.response);
	addOutputText(final);
	return { snapshot, final };
}

beforeAll(() => setupTestRuntime());

describe("Responses lifecycle events carry a complete Response", () => {
	it("on a provider stream re-encoded for a Responses client", async () => {
		const chunks = [
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "It is noon." }, finish_reason: null }] },
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
			{ id: "c1", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 } },
		];
		const upstream = new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200 });
		const ctx: any = {
			requestId: "req_lifecycle", workspaceId: "ws", endpoint: "responses", protocol: "openai.responses", capability: "text.generate",
			model: "openai/gpt-5.4-nano", requestedModel: "openai/gpt-5.4-nano", stream: true, body: REQUEST, rawBody: REQUEST,
			meta: {}, providers: [], pricing: {}, gating: {},
		};
		const response = await handleStreamResponse(ctx, {
			kind: "stream", stream: upstream.body, upstream, provider: "openai", usageFinalizer: async () => null,
			bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
		} as any, null);
		const frames = parse(await response.text());
		expectCompleteResponses(frames);
		// The completed Response carries the output streamed before it.
		const { snapshot, final } = accumulate(frames);
		expect(final.output_text).toBe("It is noon.");
		expect(snapshot.output_text).toBe("It is noon.");
	});

	it("on a server-tool stream that fails after a completed round", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "openai.responses",
			requestId: "req_live_lifecycle",
			model: "openai/gpt-5.4-nano",
			request: REQUEST,
			run: async (sink) => {
				const emit = sink.beginRound();
				emit({ type: "delta_text", channel: "output_text", text: "Checking.", choiceIndex: 0 });
				return new Response(JSON.stringify({ error: "empty_response" }), { status: 502 });
			},
			// As the pipeline presents it (presentUsageForClient for responses).
			chargedUsage: () => presentUsageForClient({ input_tokens: 1_000, output_tokens: 100, total_tokens: 1_100 }, { endpoint: "responses" }),
		});
		const frames = parse(await response.text());
		expect(lifecycle(frames).map((frame) => frame.event)).toEqual(["response.created", "response.in_progress", "response.failed"]);
		expectCompleteResponses(frames);
		expect(accumulate(frames).final.output_text).toBe("Checking.");
	});
});

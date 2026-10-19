import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	classifiers: [] as any[],
	spend: [] as any[],
	rpc: vi.fn(async (_name: string, _args: unknown) => ({ error: null })),
	queries: [] as string[],
	bindings: {} as Record<string, string>,
	background: [] as Promise<unknown>[],
}));

vi.mock("@/runtime/env", () => ({
	getBindingsIfConfigured: () => state.bindings,
	dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
	getSupabaseAdmin: () => ({
		from: (table: string) => {
			state.queries.push(table);
			const rows = table === "workspace_request_classifiers" ? state.classifiers : state.spend;
			const query: any = {
				select: () => query,
				eq: () => query,
				order: () => query,
				then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
			};
			return query;
		},
		rpc: state.rpc,
	}),
}));
// The real cache keeps rows per isolate; tests read straight through.
vi.mock("@core/tiered-cache", () => ({ tieredRead: async (options: { loader: () => Promise<unknown> }) => options.loader() }));

import {
	CLASSIFIER_LABEL_KEY,
	applyRequestClassifiers,
	attachRequestClassifierCall,
	buildClassifierPrompt,
	buildClassifierRequestBody,
	buildClassifierSchema,
	buildTranscript,
	buildTranscriptTurns,
	classifierOutputTokens,
	excludeFromRequestClassification,
	mergeClassifierLabels,
	parseClassifierAnswer,
	pendingDimensions,
	sampleBucket,
} from "./request-classifiers";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const DEPARTMENT = {
	key: "department", name: "Department", description: "Business function", multiple: false, allow_other: true,
	values: [{ value: "engineering", description: "Code" }, { value: "legal", description: null }],
};
const TOPICS = {
	key: "topics", name: "Topics", description: null, multiple: true, allow_other: false,
	values: [{ value: "billing", description: null }, { value: "security", description: null }, { value: "hiring", description: null }],
};

function classifier(overrides: Record<string, unknown> = {}) {
	return {
		id: "00000000-0000-4000-8000-0000000000c1", workspace_id: WORKSPACE, name: "Department", description: null, enabled: true,
		model: "google/gemini-2.5-flash-lite", instructions: "", dimensions: [DEPARTMENT], sample_rate_bps: 10_000,
		sample_by: "request", input_scope: "prompt", scope: {}, monthly_budget_nanos: null, created_by: null,
		created_at: "2026-10-19T12:00:00Z", updated_at: "2026-10-19T12:00:00Z", ...overrides,
	} as any;
}

function answer(body: Record<string, unknown>, costNanos = 25_000) {
	return new Response(JSON.stringify({ id: "resp_classifier", cost_nanos: costNanos, output_text: JSON.stringify(body) }), { status: 200 });
}

function ctx(overrides: Record<string, any> = {}) {
	return {
		requestId: "req_1", workspaceId: WORKSPACE, endpoint: "chat.completions", model: "openai/gpt-5", requestedModel: "openai/gpt-5",
		rawBody: { messages: [{ role: "system", content: "Be brief" }, { role: "user", content: "Review this contract clause" }] },
		meta: { apiKeyId: "00000000-0000-4000-8000-0000000000a1", labels: [] as any[], sessionId: null },
		...overrides,
	} as any;
}

beforeEach(() => {
	state.classifiers = [classifier()];
	state.spend = [];
	state.rpc.mockClear();
	state.queries = [];
	state.bindings = {};
	state.background = [];
});

describe("transcript", () => {
	it("labels turns across chat, responses and messages shapes and keeps tool names only", () => {
		expect(buildTranscriptTurns({
			tools: [{ type: "function", function: { name: "search_docs", parameters: { huge: true } } }],
			messages: [
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: [{ type: "text", text: "Find the policy" }, { type: "image_url", image_url: { url: "x" } }] },
				{ role: "assistant", content: null, tool_calls: [{ function: { name: "search_docs", arguments: "{}" } }] },
				{ role: "tool", content: "Policy 4.2" },
			],
		})).toEqual(["TOOLS: search_docs", "SYSTEM: You are helpful", "USER: Find the policy\n[image]", "TOOL_CALL: search_docs", "TOOL_RESULT: Policy 4.2"]);

		expect(buildTranscriptTurns({
			instructions: "Answer in French",
			input: [{ role: "user", content: [{ type: "input_text", text: "Hello" }] }, { type: "function_call", name: "lookup" }, { type: "function_call_output", output: "42" }],
		})).toEqual(["SYSTEM: Answer in French", "USER: Hello", "TOOL_CALL: lookup", "TOOL_RESULT: 42"]);

		expect(buildTranscriptTurns({
			system: [{ type: "text", text: "Be terse" }],
			messages: [{ role: "assistant", content: [{ type: "text", text: "Sure" }, { type: "tool_use", name: "calc", input: {} }] }, { role: "user", content: [{ type: "tool_result", content: "7" }] }],
		})).toEqual(["SYSTEM: Be terse", "TOOL_CALL: calc", "ASSISTANT: Sure", "TOOL_RESULT: 7"]);
	});

	it("truncates long turns, adds the response only when asked, and redacts secrets", () => {
		const long = buildTranscript({ messages: [{ role: "user", content: "x".repeat(5_000) }] }, null);
		expect(long).toContain("...[truncated]");
		expect(long.length).toBeLessThan(4_100);
		const withResponse = buildTranscript({ input: "Summarise" }, { output: [{ type: "message", content: [{ type: "output_text", text: "Done" }] }] });
		expect(withResponse).toBe("USER: Summarise\n\nRESPONSE: Done");
		const secret = buildTranscript({ input: "my key is sk-abcdefghijklmnopqrstuvwx" }, null);
		expect(secret).not.toContain("sk-abcdefghijklmnopqrstuvwx");
		expect(secret).toContain("[REDACTED_SECRET]");
	});

	it("keeps the start and end of very long conversations", () => {
		const messages = Array.from({ length: 40 }, (_, index) => ({ role: "user", content: `turn ${index} ${"y".repeat(3_000)}` }));
		const transcript = buildTranscript({ messages }, null);
		expect(transcript).toContain("turn 0 ");
		expect(transcript).toContain("turn 39 ");
		expect(transcript).toContain("[earlier turns omitted]");
	});
});

describe("classifier request", () => {
	it("builds a strict schema with positional keys, other, and arrays for multi-value dimensions", () => {
		const schema = buildClassifierSchema([DEPARTMENT, TOPICS]) as any;
		expect(schema.required).toEqual(["d0", "d1"]);
		expect(schema.properties.d0.properties.value).toEqual({ type: "string", enum: ["engineering", "legal", "other"] });
		expect(schema.properties.d1.properties.value).toEqual({ type: "array", items: { type: "string", enum: ["billing", "security", "hiring"] } });
		expect(schema.additionalProperties).toBe(false);
	});

	it("describes every dimension and value, and appends workspace instructions", () => {
		const prompt = buildClassifierPrompt(classifier({ instructions: "Treat contracts as legal." }), [DEPARTMENT, TOPICS]);
		expect(prompt).toContain("d0: Department - Business function");
		expect(prompt).toContain("  - engineering: Code");
		expect(prompt).toContain("  - other: none of the values above fit");
		expect(prompt).toContain("d1: Topics");
		expect(prompt).toContain("Choose every value that applies");
		expect(prompt).toContain("Treat contracts as legal.");
		const body = buildClassifierRequestBody(classifier(), [DEPARTMENT], "USER: hi") as any;
		expect(body).toMatchObject({ model: "google/gemini-2.5-flash-lite", stream: false, store: false, temperature: 0 });
		expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, name: "request_classification" });
	});

	it("keeps only listed values, one for single dimensions, and clamps confidence", () => {
		const payload = { output_text: JSON.stringify({ d0: { value: "LEGAL", confidence: 1.4 }, d1: { value: ["billing", "made-up", "security", "billing"], confidence: 0.6 } }) };
		expect(parseClassifierAnswer(payload, [DEPARTMENT, TOPICS])).toEqual([
			{ key: "department", value: "legal", confidence: 1 },
			{ key: "topics", value: "billing", confidence: 0.6 },
			{ key: "topics", value: "security", confidence: 0.6 },
		]);
		expect(parseClassifierAnswer({ output_text: JSON.stringify({ d0: { value: "finance", confidence: 0.9 } }) }, [DEPARTMENT])).toEqual([]);
		expect(parseClassifierAnswer({ output_text: "not json" }, [DEPARTMENT])).toBeNull();
	});
});

describe("labels", () => {
	it("skips dimensions the caller already labelled", () => {
		expect(pendingDimensions(classifier({ dimensions: [DEPARTMENT, TOPICS] }), [{ key: "department", value: "sales" }]).map((d) => d.key)).toEqual(["topics"]);
	});

	it("lets caller labels win and the first classifier own a shared key", () => {
		const merged = mergeClassifierLabels([{ key: "team", value: "core" }], [
			{ classifier_id: "a", status: "classified", model: "m", labels: [{ key: "department", value: "legal", confidence: 1 }, { key: "team", value: "other", confidence: 1 }] },
			{ classifier_id: "b", status: "classified", model: "m", labels: [{ key: "department", value: "sales", confidence: 1 }, { key: "topics", value: "billing", confidence: 1 }, { key: "topics", value: "security", confidence: 1 }] },
		]);
		expect(merged).toEqual([
			{ key: "team", value: "core" },
			{ key: "department", value: "legal" },
			{ key: "topics", value: "billing" },
			{ key: "topics", value: "security" },
		]);
	});

	it("samples deterministically", async () => {
		const first = await sampleBucket("seed");
		expect(await sampleBucket("seed")).toBe(first);
		expect(first).toBeGreaterThanOrEqual(0);
		expect(first).toBeLessThan(10_000);
	});
});

describe("classifierOutputTokens", () => {
	it("leaves room to pick every value of a multi-value dimension", () => {
		const values = Array.from({ length: 50 }, (_, index) => ({ value: `${"v".repeat(60)}${index}` }));
		const single = classifierOutputTokens([{ key: "a", name: "a", description: null, multiple: false, allow_other: false, values } as any]);
		const multiple = classifierOutputTokens([{ key: "a", name: "a", description: null, multiple: true, allow_other: false, values } as any]);
		expect(single).toBeLessThan(150);
		// 50 values of 61 to 62 characters is about 1,050 tokens of JSON strings.
		expect(multiple).toBeGreaterThan(1_100);
	});
});

describe("applyRequestClassifiers", () => {
	it("adds the answers as labels, records spend and keeps the outcome", async () => {
		const call = vi.fn(async () => answer({ d0: { value: "legal", confidence: 0.9 } }));
		const context = ctx({ requestClassifierCall: call });
		await applyRequestClassifiers(context, null);
		expect(context.meta.labels).toEqual([{ key: "department", value: "legal" }]);
		expect(context.requestClassifications).toEqual([{
			classifier_id: classifier().id, status: "classified", model: "google/gemini-2.5-flash-lite",
			labels: [{ key: "department", value: "legal", confidence: 0.9 }], response_id: "resp_classifier", cost_nanos: 25_000,
		}]);
		expect(call).toHaveBeenCalledWith(expect.objectContaining({ model: "google/gemini-2.5-flash-lite" }), classifier().id);
		const sent = (call.mock.calls[0] as any)[0].input[1].content[0].text as string;
		expect(sent).toContain("USER: Review this contract clause");
		expect(state.rpc).toHaveBeenCalledWith("record_request_classifier_spend", { p_workspace_id: WORKSPACE, p_classifier_id: classifier().id, p_cost_nanos: 25_000 });
	});

	it("retries a failed spend write so the budget still sees the cost", async () => {
		state.rpc.mockResolvedValueOnce({ error: { message: "connection reset" } } as any);
		const context = ctx({ requestClassifierCall: vi.fn(async () => answer({ d0: { value: "legal", confidence: 0.9 } })) });
		await applyRequestClassifiers(context, null);
		expect(state.rpc).toHaveBeenCalledTimes(2);
		expect(context.meta.labels).toEqual([{ key: "department", value: "legal" }]);
	});

	it("keeps calls that outlive the timeout running in the background, unlabelled", async () => {
		vi.useFakeTimers();
		try {
			let finish: (response: Response) => void = () => {};
			const call = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
			const context = ctx({ requestClassifierCall: call });
			const run = applyRequestClassifiers(context, null);
			await vi.advanceTimersByTimeAsync(12_000);
			await run;
			expect(context.meta.labels).toEqual([]);
			expect(state.background).toHaveLength(1);
			finish(answer({ d0: { value: "legal", confidence: 0.9 } }));
			await state.background[0];
			expect(state.rpc).toHaveBeenCalledWith("record_request_classifier_spend", expect.objectContaining({ p_cost_nanos: 25_000 }));
		} finally {
			vi.useRealTimers();
		}
	});

	it("does nothing for classifier calls, untagged endpoints, testing mode, or without credentials", async () => {
		const call = vi.fn(async () => answer({ d0: { value: "legal", confidence: 1 } }));
		for (const overrides of [
			{ classifierSubrequest: true, requestClassifierCall: call },
			{ endpoint: "embeddings", requestClassifierCall: call },
			{ testingMode: true, requestClassifierCall: call },
			{ kill: true, requestClassifierCall: call },
			{},
		]) {
			state.bindings = (overrides as any).kill ? { REQUEST_CLASSIFIERS_ENABLED: "false" } : {};
			const context = ctx(overrides);
			await applyRequestClassifiers(context, null);
			expect(context.meta.labels).toEqual([]);
		}
		expect(call).not.toHaveBeenCalled();
		expect(state.queries).toEqual([]);
	});

	it("does not classify a settings test run, which carries the classifier label over HTTP", async () => {
		const call = vi.fn(async () => answer({ d0: { value: "legal", confidence: 1 } }));
		const labels = [{ key: CLASSIFIER_LABEL_KEY, value: "test" }];
		const context = ctx({ requestClassifierCall: call, meta: { ...ctx().meta, labels } });
		await applyRequestClassifiers(context, null);
		expect(context.meta.labels).toEqual(labels);
		expect(call).not.toHaveBeenCalled();
		expect(state.queries).toEqual([]);
	});

	it("skips classifiers outside their scope or whose dimensions the caller already labelled", async () => {
		state.classifiers = [
			classifier({ id: "00000000-0000-4000-8000-0000000000c2", scope: { key_ids: ["00000000-0000-4000-8000-0000000000ff"] } }),
			classifier({ id: "00000000-0000-4000-8000-0000000000c3", scope: { models: ["anthropic/claude-sonnet-5-5"] } }),
			classifier({ id: "00000000-0000-4000-8000-0000000000c4" }),
		];
		const call = vi.fn(async () => answer({ d0: { value: "engineering", confidence: 1 } }));
		const context = ctx({ requestClassifierCall: call, meta: { ...ctx().meta, labels: [{ key: "department", value: "sales" }] } });
		await applyRequestClassifiers(context, null);
		expect(call).not.toHaveBeenCalled();
		expect(context.meta.labels).toEqual([{ key: "department", value: "sales" }]);
	});

	it("pauses at the monthly budget and records a failed answer without labels", async () => {
		state.classifiers = [classifier({ monthly_budget_nanos: "1000" })];
		state.spend = [{ classifier_id: classifier().id, cost_nanos: "1000" }];
		const call = vi.fn(async () => answer({ d0: { value: "legal", confidence: 1 } }));
		const paused = ctx({ requestClassifierCall: call });
		await applyRequestClassifiers(paused, null);
		expect(call).not.toHaveBeenCalled();
		expect(paused.requestClassifications).toMatchObject([{ status: "budget_reached", labels: [] }]);

		state.classifiers = [classifier()];
		const broken = ctx({ requestClassifierCall: vi.fn(async () => new Response(JSON.stringify({ output_text: "{" }), { status: 200 })) });
		await applyRequestClassifiers(broken, null);
		expect(broken.meta.labels).toEqual([]);
		expect(broken.requestClassifications).toMatchObject([{ status: "failed" }]);
	});

	it("only classifies the response when the classifier asks for it", async () => {
		state.classifiers = [classifier({ input_scope: "prompt_and_response" })];
		const call = vi.fn(async () => answer({ d0: { value: "legal", confidence: 1 } }));
		await applyRequestClassifiers(ctx({ requestClassifierCall: call }), { choices: [{ message: { content: "Clause 3 is unenforceable" } }] });
		expect((call.mock.calls[0] as any)[0].input[1].content[0].text).toContain("RESPONSE: Clause 3 is unenforceable");
	});

	it("respects the sample rate", async () => {
		state.classifiers = [classifier({ sample_rate_bps: 1 })];
		const call = vi.fn(async () => answer({ d0: { value: "legal", confidence: 1 } }));
		let calls = 0;
		for (let index = 0; index < 50; index += 1) {
			await applyRequestClassifiers(ctx({ requestId: `req_${index}`, requestClassifierCall: call }), null);
			calls = call.mock.calls.length;
		}
		expect(calls).toBeLessThan(5);
	});
});

describe("attachRequestClassifierCall", () => {
	it("calls the gateway with the caller's credentials and a label, and marks that call", async () => {
		const handler = vi.fn(async (_request: Request) => new Response("{}"));
		const parent = ctx();
		attachRequestClassifierCall(parent, new Request("https://gateway.test/v1/chat/completions", { headers: { Authorization: "Bearer key" } }), () => handler);
		await parent.requestClassifierCall({ model: "m" }, "clf_1");
		const sent = handler.mock.calls[0][0];
		expect(sent.headers.get("authorization")).toBe("Bearer key");
		expect(JSON.parse(sent.headers.get("x-phaseo-metadata")!)).toEqual({ labels: [{ key: CLASSIFIER_LABEL_KEY, value: "clf_1" }] });

		const child = ctx();
		attachRequestClassifierCall(child, sent, () => handler);
		expect(child.classifierSubrequest).toBe(true);
		expect(child.requestClassifierCall).toBeUndefined();

		const forged = ctx();
		attachRequestClassifierCall(forged, new Request(sent.url, { headers: sent.headers }), () => handler);
		expect(forged.classifierSubrequest).toBeUndefined();

		// The auto-router's call is neither classified nor treated as a classifier call.
		const routed = ctx();
		attachRequestClassifierCall(routed, excludeFromRequestClassification(new Request(sent.url, { headers: sent.headers })), () => handler);
		expect(routed.requestClassifierCall).toBeUndefined();
		expect(routed.classifierSubrequest).toBeUndefined();
	});
});

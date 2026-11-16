import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServerToolContinuation, prepareServerToolsForTextRequest } from "./server-tools";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: (...args: any[]) => getBindingsMock(...args),
}));

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function searchRound(args: Record<string, unknown> = { query: "phaseo launch" }) {
	return {
		choices: [{
			message: {
				role: "assistant",
				content: [],
				toolCalls: [{ id: "call_search", name: "phaseo_web_search", arguments: JSON.stringify(args) }],
			},
			finishReason: "tool_calls",
		}],
	} as any;
}

function prepared(parameters: Record<string, unknown>) {
	const result = prepareServerToolsForTextRequest(
		{ model: "openai/gpt-5-nano", messages: [], tools: [{ type: "phaseo:web_search", parameters }] },
		"openai.chat.completions",
	);
	if (!result.ok) throw new Error(result.message);
	return result.config;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
	return JSON.parse(String((fetchMock.mock.calls[index] as any)[1].body));
}

beforeEach(() => {
	getBindingsMock.mockReset();
	getBindingsMock.mockReturnValue({
		EXA_API_KEY: "exa_key",
		EXA_BASE_URL: "https://api.exa.ai",
		PARALLEL_API_KEY: "parallel_key",
		PARALLEL_BASE_URL: "https://api.parallel.ai",
		PERPLEXITY_API_KEY: "pplx_key",
		PERPLEXITY_BASE_URL: "https://api.perplexity.ai",
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("web search modes", () => {
	it.each([
		["exa", "fast-deep", "is not available for engine \"exa\""],
		["parallel", "deep", "is not available for engine \"parallel\""],
		["tinyfish", "fast", "has no modes"],
	])("rejects mode %s/%s instead of ignoring it", (engine, mode, message) => {
		const result = prepareServerToolsForTextRequest(
			{ model: "openai/gpt-5-nano", messages: [], tools: [{ type: "phaseo:web_search", parameters: { engine, mode } }] },
			"openai.chat.completions",
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain(message);
	});

	it("runs Exa deep search and charges what Exa reports for the call", async () => {
		const fetchMock = vi.fn(async () => json({
			requestId: "exa_req",
			output: { content: "Phaseo shipped on 2026-11-16." },
			costDollars: { total: 0.014 },
			results: [{ title: "Phaseo", url: "https://phaseo.app" }],
		}));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "exa", mode: "deep" }));

		expect(bodyOf(fetchMock)).toMatchObject({ type: "deep" });
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ mode: "deep", answer: "Phaseo shipped on 2026-11-16." });
		expect(continuation?.searchPricing?.lines).toEqual([
			expect.objectContaining({ engine: "exa", mode: "deep", line_nanos: 14_000_000, price_source: "provider_reported" }),
		]);
	});

	it("runs a Parallel search in the chosen mode and charges its results past 10", async () => {
		const results = Array.from({ length: 12 }, (_, index) => ({ title: `R${index}`, url: `https://example.com/${index}` }));
		const fetchMock = vi.fn(async () => json({ search_id: "s1", results }));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(
			searchRound({ query: "phaseo", max_results: 12 }),
			prepared({ engine: "parallel", mode: "basic", max_results: 12 }),
		);

		expect(bodyOf(fetchMock)).toMatchObject({ mode: "basic" });
		// basic $5 per 1,000 + 2 results past 10 at $1 per 1,000.
		expect(continuation?.searchPricing?.total_nanos).toBe(7_000_000);
	});

	it("runs Parallel's default advanced mode when no mode is set", async () => {
		const fetchMock = vi.fn(async () => json({ search_id: "s1", results: [{ title: "R", url: "https://example.com" }] }));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "parallel" }));

		expect(bodyOf(fetchMock)).toMatchObject({ mode: "advanced" });
		expect(continuation?.searchPricing?.total_nanos).toBe(5_000_000);
	});

	it("runs Perplexity Fast Search and charges $1 per 1,000", async () => {
		const fetchMock = vi.fn(async () => json({ id: "p1", results: [] }));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "perplexity", mode: "fast" }));

		expect(bodyOf(fetchMock)).toMatchObject({ search_type: "fast" });
		// Perplexity bills a successful request even when it finds nothing.
		expect(continuation?.searchPricing?.total_nanos).toBe(1_000_000);
	});

	it("runs the engine the model picks in that engine's default mode, not the tool's", async () => {
		const fetchMock = vi.fn(async () => json({ id: "p1", results: [] }));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(
			searchRound({ query: "phaseo", engine: "perplexity" }),
			prepared({ engine: "exa", mode: "deep" }),
		);

		expect(bodyOf(fetchMock)).not.toHaveProperty("search_type");
		expect(continuation?.searchPricing?.lines).toEqual([expect.objectContaining({ engine: "perplexity", mode: "standard" })]);
	});

	it("charges nothing for a search the provider rejected", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => json({ error: "bad" }, 500)));

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "exa", mode: "lite" }));

		expect(continuation?.toolResults[0]?.isError).toBe(true);
		expect(continuation?.searchPricing).toBeUndefined();
	});
});

describe("research modes", () => {
	it("runs an Exa Agent run to completion and charges its reported cost", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => init?.method === "POST"
			? json({ id: "run_1", status: "queued" })
			: json({
				id: "run_1",
				status: "completed",
				output: { text: "Answer.", grounding: [{ field: "text", citations: [{ url: "https://a.example", title: "A" }] }] },
				costDollars: { total: 0.025 },
			}));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "exa", mode: "agent-low" }));

		expect(fetchMock.mock.calls[0]![0]).toBe("https://api.exa.ai/agent/runs");
		expect(bodyOf(fetchMock)).toEqual({ query: "phaseo launch", effort: "low" });
		expect(fetchMock.mock.calls[1]![0]).toBe("https://api.exa.ai/agent/runs/run_1");
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({
			engine: "exa",
			mode: "agent-low",
			answer: "Answer.",
			results: [{ url: "https://a.example", title: "A" }],
		});
		expect(continuation?.searchPricing?.lines).toEqual([
			expect.objectContaining({ mode: "agent-low", line_nanos: 25_000_000, price_source: "provider_reported" }),
		]);
	});

	it("charges nothing for an Exa Agent run that failed", async () => {
		vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
			? json({ id: "run_1", status: "queued" })
			: json({ id: "run_1", status: "failed", error: { message: "no sources" } })));

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "exa", mode: "agent-minimal" }));

		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ error: "research_failed", status: "failed" });
		expect(continuation?.searchPricing).toBeUndefined();
	});

	it("waits on a Parallel Task run through a 408 and charges the completed run", async () => {
		const responses = [
			json({ run_id: "trun_1", status: "queued" }, 202),
			json({ type: "error", error: { message: "still running" } }, 408),
			json({
				run: { run_id: "trun_1", status: "completed" },
				output: {
					type: "text",
					content: "Report.",
					basis: [{ field: "output", reasoning: "r", citations: [{ url: "https://b.example", title: "B", excerpts: ["quote"] }] }],
				},
			}),
		];
		const fetchMock = vi.fn(async () => responses.shift()!);
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "parallel", mode: "task-base" }));

		expect(fetchMock.mock.calls[0]![0]).toBe("https://api.parallel.ai/v1/tasks/runs");
		expect(bodyOf(fetchMock)).toEqual({ input: "phaseo launch", processor: "base", task_spec: { output_schema: { type: "text" } } });
		expect(String(fetchMock.mock.calls[1]![0])).toMatch(/^https:\/\/api\.parallel\.ai\/v1\/tasks\/runs\/trun_1\/result\?timeout=\d+$/);
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({
			mode: "task-base",
			answer: "Report.",
			results: [{ url: "https://b.example", title: "B", highlights: ["quote"] }],
		});
		expect(continuation?.searchPricing?.total_nanos).toBe(10_000_000);
	});

	it("abandons a Parallel Task run past the time limit without charging it", async () => {
		const start = Date.now();
		const fetchMock = vi.fn(async () => {
			// The run is created, then the clock is past the 120-second limit.
			vi.spyOn(Date, "now").mockReturnValue(start + 121_000);
			return json({ run_id: "trun_1", status: "queued" }, 202);
		});
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(searchRound(), prepared({ engine: "parallel", mode: "task-lite" }));

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ error: "research_timeout", run_id: "trun_1" });
		expect(continuation?.searchPricing).toBeUndefined();
	});

	it("stops a research run when the client disconnects, without charging it", async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			controller.abort();
			if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
			return json({ id: "run_1", status: "queued" });
		});
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(
			searchRound(),
			prepared({ engine: "exa", mode: "agent-low" }),
			{ signal: controller.signal },
		);

		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ error: "research_cancelled" });
		expect(continuation?.searchPricing).toBeUndefined();
	});
});

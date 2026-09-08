import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openBatchResultsStream } from "./batch-results";
import { fetchProviderBatchApi, fetchProviderFileContent } from "./batch-provider-adapters";

vi.mock("./batch-provider-adapters", async (original) => ({
	...await original<typeof import("./batch-provider-adapters")>(),
	fetchProviderBatchApi: vi.fn(), fetchProviderFileContent: vi.fn(),
}));
const api = vi.mocked(fetchProviderBatchApi);
const file = vi.mocked(fetchProviderFileContent);
const encode = (value: string) => new TextEncoder().encode(value);
const json = (value: unknown) => new Response(JSON.stringify(value));
const download = async (provider: string, extra = {}) => new Response(await openBatchResultsStream({ provider, nativeBatchId: "native", ...extra })).text();

describe("batch result streams", () => {
	beforeEach(() => vi.resetAllMocks());
	afterEach(() => vi.restoreAllMocks());
	it.each(["openai", "groq", "together", "alibaba-cloud", "moonshotai", "parasail", "ovhcloud", "mistral"])("combines complete success and error files for %s", async (provider) => {
		const success = '{"custom_id":"ok","response":{"body":{"choices":[{"message":{"content":"FULL OUTPUT"}}]}}}';
		const failure = '{"custom_id":"bad","error":{"message":"rejected"}}\n';
		file.mockResolvedValueOnce(new Response(success)).mockResolvedValueOnce(new Response(failure));
		expect(await download(provider, { outputFileId: "success", errorFileId: "errors" })).toBe(`${success}\n${failure}`);
		expect(file.mock.calls.map((call) => call.slice(0, 2))).toEqual([[provider, "success"], [provider, "errors"]]);
		expect(file.mock.calls[0][2]).toMatchObject({ redirect: "manual", signal: expect.any(AbortSignal) });
		expect(api).not.toHaveBeenCalled();
	});
	it("deduplicates file IDs and preserves empty files", async () => {
		file.mockResolvedValueOnce(new Response(""));
		expect(await download("openai", { outputFileId: "same", errorFileId: "same" })).toBe("");
		expect(file).toHaveBeenCalledTimes(1);
	});
	it("preflights the error file before exposing successful output", async () => {
		const cancel = vi.fn();
		file.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }))).mockResolvedValueOnce(new Response("secret", { status: 403 }));
		await expect(download("openai", { outputFileId: "good", errorFileId: "bad" })).rejects.toMatchObject({ reason: "provider_http_error", providerStatus: 403 });
		expect(cancel).toHaveBeenCalledOnce();
	});
	it("preserves native Anthropic bytes", async () => {
		const content = '{"custom_id":"a","result":{"message":{"content":[{"text":"你好"}]}}}\n';
		api.mockResolvedValueOnce(new Response(content));
		expect(await download("anthropic")).toBe(content);
		expect(api.mock.calls[0][1]).toMatchObject({ endpointPath: "/messages/batches/native/results", redirect: "manual" });
	});
	it.each(["response", "metadata"])("streams Gemini REST inline rows from %s without losing content or errors", async (location) => {
		const rows = [{ metadata: { key: "one" }, response: { candidates: [{ content: { parts: [{ text: "héllo 🎉" }] } }] } }, { metadata: { key: "two" }, error: { code: 3, message: "invalid" } }];
		const output = { inlinedResponses: { inlinedResponses: rows } };
		const bytes = encode(JSON.stringify(location === "response" ? { response: output } : { metadata: { output } }));
		api.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } })));
		expect(await download("google-ai-studio")).toBe(rows.map((row) => JSON.stringify(row) + "\n").join(""));
	});
	it("discovers Google output files", async () => {
		api.mockResolvedValueOnce(json({ response: { responsesFile: "files/google" } }));
		file.mockResolvedValueOnce(new Response('{"key":"one","response":{}}\n'));
		expect(await download("google-ai-studio")).toContain('"key":"one"');
		expect(file.mock.calls[0].slice(0, 2)).toEqual(["google-ai-studio", "files/google"]);
	});
	it("does not duplicate Gemini rows mirrored in operation metadata", async () => {
		const output = { inlinedResponses: { inlinedResponses: [{ response: { text: "one" } }] } };
		api.mockResolvedValueOnce(json({ response: output, metadata: { output } }));
		expect(await download("google-ai-studio")).toBe('{"response":{"text":"one"}}\n');
	});
	it.each([
		"dest.inlinedResponses", "dest.inlinedEmbedContentResponses",
		"response.inlinedResponses", "response.inlinedEmbedContentResponses",
		"metadata.output.inlinedResponses", "metadata.output.inlinedEmbedContentResponses", "inlinedResponses",
	])("supports direct and nested Gemini arrays at %s", async (path) => {
		const rows = [{ metadata: { key: "one" }, response: { embedding: { values: [0.1, 0.2] } } }, { metadata: { key: "two" }, error: { code: 3 } }];
		for (const value of [rows, { inlinedResponses: rows }]) {
			const payload = path.split(".").reverse().reduce<unknown>((child, key) => ({ [key]: child }), value);
			api.mockResolvedValueOnce(json(payload));
			expect(await download("google-ai-studio")).toBe(rows.map(row => JSON.stringify(row) + "\n").join(""));
		}
	});
	it("streams an inline document larger than the per-row limit", async () => {
		const row = JSON.stringify({ response: { text: "x".repeat(1024 * 1024) } });
		let step = 0;
		api.mockResolvedValueOnce(new Response(new ReadableStream({ pull(controller) {
			if (step === 0) controller.enqueue(encode('{"response":{"inlinedResponses":{"inlinedResponses":['));
			else if (step <= 12) controller.enqueue(encode((step > 1 ? "," : "") + row));
			else { controller.enqueue(encode("]}}}")); controller.close(); }
			step++;
		} })));
		const reader = (await openBatchResultsStream({ provider: "google-ai-studio", nativeBatchId: "native" })).getReader();
		let rows = 0;
		while (!(await reader.read()).done) rows++;
		expect(rows).toBe(12);
	});
	it("rejects an already aborted request before provider access", async () => {
		const abort = new AbortController(); abort.abort();
		await expect(openBatchResultsStream({ provider: "anthropic", nativeBatchId: "native" }, { signal: abort.signal })).rejects.toThrow();
		expect(api).not.toHaveBeenCalled();
	});
	it("prefers both Mistral files to inline mirrors", async () => {
		api.mockResolvedValueOnce(json({ output_file: "out", error_file: "err" }));
		file.mockResolvedValueOnce(new Response('{"ok":true}\n')).mockResolvedValueOnce(new Response('{"error":"bad"}\n'));
		expect(await download("mistral")).toBe('{"ok":true}\n{"error":"bad"}\n');
		expect(api).toHaveBeenCalledTimes(1);
	});
	it("falls back to complete Mistral inline output when no files exist", async () => {
		api.mockResolvedValueOnce(json({ output_file: null })).mockResolvedValueOnce(json({ outputs: [{ custom_id: "a", response: { body: { choices: ["full"] } } }, { custom_id: "b", error: { message: "bad" } }] }));
		const rows = (await download("mistral")).trim().split("\n").map((line) => JSON.parse(line));
		expect(rows).toHaveLength(2);
		expect(rows[0].response.body.choices).toEqual(["full"]);
		expect(api.mock.calls[1][1].endpointPath).toBe("/batch/jobs/native?inline=true");
	});
	it("follows xAI result cursors, including error records", async () => {
		api.mockResolvedValueOnce(json({ results: [{ batch_request_id: "one", batch_result: { response: { chat_get_completion: { choices: ["full"] } } } }], pagination_token: "next/+" }))
			.mockResolvedValueOnce(json({ results: [{ batch_request_id: "two", error_message: "bad" }], pagination_token: null }));
		const rows = (await download("x-ai")).trim().split("\n").map((line) => JSON.parse(line));
		expect(rows.map((row) => row.batch_request_id)).toEqual(["one", "two"]);
		expect(api.mock.calls[1][1].endpointPath).toContain("pagination_token=next%2F%2B");
	});
	it("accepts an empty xAI page but rejects missing or malformed results", async () => {
		api.mockResolvedValueOnce(json({ results: [], pagination_token: null }));
		expect(await download("x-ai")).toBe("");
		api.mockResolvedValueOnce(json({ unexpected: [] }));
		await expect(download("x-ai")).rejects.toMatchObject({ reason: "missing_results_array" });
		api.mockResolvedValueOnce(json({ results: null }));
		await expect(download("x-ai")).rejects.toMatchObject({ reason: "invalid_results_array" });
	});
	it("fails the download if a provider repeats a cursor", async () => {
		api.mockImplementation(async () => json({ results: [{ batch_request_id: "one" }], pagination_token: "same" }));
		await expect(download("x-ai")).rejects.toThrow("batch_results_stream_failed");
		expect(api).toHaveBeenCalledTimes(2);
	});
	it("does not silently finish a truncated inline response", async () => {
		api.mockResolvedValueOnce(new Response('{"response":{"inlinedResponses":{"inlinedResponses":[{"response":{"text":"one"}},'));
		await expect(download("google-ai-studio")).rejects.toThrow("batch_results_stream_failed");
	});
	it("bounds individual inline rows", async () => {
		api.mockResolvedValueOnce(json({ response: { inlinedResponses: { inlinedResponses: [{ response: { text: "x".repeat(9 * 1024 * 1024) } }] } } }));
		await expect(download("google-ai-studio")).rejects.toMatchObject({ reason: "inline_result_row_too_large" });
	});
	it("cancels the current reader and prefetched error file", async () => {
		const current = vi.fn(), prefetched = vi.fn();
		file.mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { c.enqueue(encode('{"ok":true}\n')); }, cancel: current })))
			.mockResolvedValueOnce(new Response(new ReadableStream({ cancel: prefetched })));
		const reader = (await openBatchResultsStream({ provider: "openai", outputFileId: "out", errorFileId: "err" })).getReader();
		await reader.read(); await reader.cancel();
		expect(current).toHaveBeenCalledOnce(); expect(prefetched).toHaveBeenCalledOnce();
	});
	it("rejects missing outputs without manufacturing rows from billing metadata", async () => {
		api.mockResolvedValueOnce(json({ status: "completed" }));
		await expect(download("openai")).rejects.toMatchObject({ reason: "results_unavailable" });
	});
});

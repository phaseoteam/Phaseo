import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { deleteVertexBatchInput, fetchVertexBatchApi, normalizeVertexBatchOutput, prepareVertexBatch, vertexBatchOutputs, type VertexBatchStorage } from "./batch";
import { batchMetaFromProviderPayload, normalizeProviderBatchPayload } from "@core/batch-provider-adapters";

const credential = { key: "test-token", source: "gateway" as const, byokKeyId: null };
const storage: VertexBatchStorage = {
	project: "test-project", location: "global", bucket: "test-batch-bucket",
	inputObject: "inputs/workspace-a/batch-a.jsonl", outputPrefix: "outputs/workspace-a/batch-a/",
};
const fetchMock = vi.fn();
const nativeRow = (key: string) => ({ phaseo_custom_id: key, request: { contents: [] }, status: "", response: {
	candidates: [{ content: { parts: [{ text: "OK" }] } }],
	usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 2 }, modelVersion: "gemini-3.1-flash-lite",
} });
async function collect(args: Partial<Parameters<typeof vertexBatchOutputs>[0]> = {}) {
	const rows = [];
	for await (const row of vertexBatchOutputs({ storage, workspaceId: "workspace-a", credential, ...args })) rows.push(row);
	return rows;
}

beforeEach(() => {
	setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "test-project", GOOGLE_VERTEX_PROJECT_NUMBER: "123456789",
		GOOGLE_VERTEX_BATCH_LOCATION: "global", GOOGLE_VERTEX_BATCH_BUCKET: "test-batch-bucket" } as any);
	vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
		// Match Workers: redirect:error throws before dispatch, unlike Node fetch.
		if (init?.redirect && !["follow", "manual"].includes(init.redirect)) throw new TypeError("Unsupported Worker redirect mode");
		return fetchMock(input, init);
	});
	fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); teardownTestRuntime(); });

describe("Vertex Batch bridge", () => {
	it("does not follow redirects when staging, cleaning up or reading results", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://untrusted.example" } }));
		await expect(prepareVertexBatch({ workspaceId: "workspace-a", batchId: "batch-a", model: "gemini-3.1-flash-lite",
			rows: [{ custom_id: "a", body: {} }], credential })).rejects.toThrow("input_upload_failed_302");
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }));
		await expect(deleteVertexBatchInput(storage, credential)).rejects.toThrow("input_cleanup_failed");
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }));
		await expect(collect()).rejects.toThrow("output_list_failed_302");
		fetchMock.mockResolvedValueOnce(Response.json({ items: [{ name: storage.outputPrefix + "out.jsonl" }] }))
			.mockResolvedValueOnce(new Response(null, { status: 302 }));
		await expect(collect()).rejects.toThrow("output_download_failed_302");
		expect(fetchMock.mock.calls.every(([, init]) => init.redirect === "manual")).toBe(true);
	});
	it("uploads owned JSONL with correlation keys and prepares a job without dispatching it", async () => {
		fetchMock.mockResolvedValueOnce(new Response("{}"));
		const prepared = await prepareVertexBatch({ workspaceId: "workspace-a", batchId: "batch-a", model: "gemini-3.1-flash-lite",
			rows: [{ custom_id: "customer-42", body: { model: "gemini-3.1-flash-lite", contents: [{ role: "user", parts: [{ text: "Hello" }] }] } }], credential });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(new URL(url).searchParams.get("name")).toBe(storage.inputObject);
		expect(new URL(url).searchParams.get("ifGenerationMatch")).toBe("0");
		expect(JSON.parse(init.body)).toEqual({ phaseo_custom_id: "customer-42", request: { contents: [{ role: "user", parts: [{ text: "Hello" }] }] } });
		expect(init.headers.Authorization).toBe("Bearer test-token");
		expect(prepared.storage).toEqual(storage);
		expect(prepared.body.instanceConfig).toEqual({ instanceType: "object", keyField: "phaseo_custom_id" });
		expect(prepared.body.outputConfig.gcsDestination.outputUriPrefix).toBe("gs://test-batch-bucket/outputs/workspace-a/batch-a/");
	});

	it("rejects BYOK and unsafe workspace paths before accessing storage", async () => {
		const args = { workspaceId: "workspace-a", batchId: "batch-a", model: "gemini-3.1-flash-lite", rows: [{ custom_id: "a", body: {} }], credential };
		await expect(prepareVertexBatch({ ...args, credential: { ...credential, source: "byok" } })).rejects.toThrow("requires_managed_credentials");
		await expect(prepareVertexBatch({ ...args, workspaceId: "../another-workspace" })).rejects.toThrow("invalid_vertex_batch_input");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("limits API paths to configured project identities and native job operations", async () => {
		fetchMock.mockResolvedValue(new Response("{}"));
		await fetchVertexBatchApi({ endpointPath: "/projects/123456789/locations/global/batchPredictionJobs/123:cancel", method: "POST", credential });
		expect(fetchMock.mock.calls[0][0]).toBe("https://aiplatform.googleapis.com/v1/projects/123456789/locations/global/batchPredictionJobs/123:cancel");
		await expect(fetchVertexBatchApi({ endpointPath: "/projects/other-project/locations/global/batchPredictionJobs/123", method: "GET", credential })).rejects.toThrow("invalid_vertex_batch_job_path");
		await expect(fetchVertexBatchApi({ endpointPath: "/projects/test-project/locations/global/batchPredictionJobs/../secrets", method: "GET", credential })).rejects.toThrow("invalid_vertex_batch_job_path");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("leaves a create network failure ambiguous", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("network failed"));
		await expect(fetchVertexBatchApi({ endpointPath: "/projects/test-project/locations/global/batchPredictionJobs", method: "POST", credential })).rejects.toThrow(TypeError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("normalizes partial completion without replacing the canonical model used for billing", () => {
		const payload = normalizeProviderBatchPayload("google-vertex", {
			name: "projects/123456789/locations/global/batchPredictionJobs/123",
			model: "publishers/google/models/gemini-3.1-flash-lite", state: "JOB_STATE_PARTIALLY_SUCCEEDED",
			completionStats: { successfulCount: "2", failedCount: "1", incompleteCount: "1" },
		});
		expect(payload).toMatchObject({ status: "completed", request_counts: { total: 4, completed: 2, failed: 1 } });
		expect(batchMetaFromProviderPayload(payload, { provider: "google-vertex", model: "google/gemini-3.1-flash-lite", vertexStorage: storage })).toMatchObject({ model: "google/gemini-3.1-flash-lite", vertexStorage: storage });
	});

	it("downloads paginated owned outputs and preserves keys when responses are reordered", async () => {
		fetchMock
			.mockResolvedValueOnce(Response.json({ items: [{ name: storage.outputPrefix + "predictions/part-1.jsonl" }], nextPageToken: "page-2" }))
			.mockResolvedValueOnce(Response.json({ items: [{ name: storage.outputPrefix + "predictions/part-2.jsonl" }] }))
			.mockResolvedValueOnce(new Response(JSON.stringify(nativeRow("second")) + "\n"))
			.mockResolvedValueOnce(new Response(JSON.stringify({ key: "first", status: "invalid request" }) + "\n"));
		const rows = await collect();
		expect(rows[0]).toMatchObject({ custom_id: "second", response: { status_code: 200, body: { usage: { input_text_tokens: 6 } } } });
		expect(rows[1]).toEqual({ custom_id: "first", error: "invalid request" });
		expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("pageToken")).toBe("page-2");
	});

	it("rejects cross-workspace storage before a network call", async () => {
		await expect(collect({ workspaceId: "workspace-b" })).rejects.toThrow("invalid_vertex_batch_output_scope");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects objects outside the stored prefix and repeated pagination tokens", async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ items: [{ name: "outputs/workspace-b/secret.jsonl" }] }));
		await expect(collect()).rejects.toThrow("invalid_vertex_batch_output_object");
		fetchMock.mockImplementation(async () => Response.json({ nextPageToken: "repeated" }));
		await expect(collect()).rejects.toThrow("vertex_batch_output_file_limit");
	});

	it("rejects duplicate or missing output correlation keys", async () => {
		expect(() => normalizeVertexBatchOutput({ response: {} })).toThrow("output_key_missing");
		fetchMock.mockResolvedValueOnce(Response.json({ items: [{ name: storage.outputPrefix + "out.jsonl" }] }))
			.mockResolvedValueOnce(new Response([nativeRow("same"), nativeRow("same")].map((row) => JSON.stringify(row)).join("\n")));
		await expect(collect()).rejects.toThrow("output_key_duplicate_or_limit");
	});

	it("cancels the underlying object reader when the consumer stops", async () => {
		const cancel = vi.fn();
		fetchMock.mockResolvedValueOnce(Response.json({ items: [{ name: storage.outputPrefix + "out.jsonl" }] }))
			.mockResolvedValueOnce(new Response(new ReadableStream({
				start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(nativeRow("a")) + "\n")); }, cancel,
			})));
		const iterator = vertexBatchOutputs({ storage, workspaceId: "workspace-a", credential });
		await iterator.next();
		await iterator.return(undefined);
		expect(cancel).toHaveBeenCalledOnce();
	});
});

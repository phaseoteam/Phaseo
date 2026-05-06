import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	authResult: {
		ok: true as const,
		workspaceId: "ws_files_test",
		apiKeyId: "key_files_test",
		apiKeyRef: "kid_files_test",
		apiKeyKid: "files_test_kid",
		userId: null,
		internal: false,
	},
	fileMeta: new Map<string, Record<string, unknown>>(),
	fetchCalls: [] as Array<{
		url: string;
		method: string;
		headers: Record<string, string>;
	}>,
}));

function resetState() {
	state.fileMeta.clear();
	state.fetchCalls = [];
}

function fileKey(workspaceId: string, fileId: string) {
	return `${workspaceId}:${fileId}`;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

vi.mock("@pipeline/before/auth", () => ({
	authenticate: vi.fn(async () => state.authResult),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		OPENAI_API_KEY: "test-openai-key",
		OPENAI_BASE_URL: "https://api.openai.example/v1",
	}),
}));

vi.mock("@providers/keys", () => ({
	resolveProviderKey: vi.fn(() => ({ key: "test-openai-key" })),
}));

vi.mock("@core/batch-jobs", () => ({
	getBatchFileMeta: vi.fn(async (workspaceId: string, fileId: string) => {
		return state.fileMeta.get(fileKey(workspaceId, fileId)) ?? null;
	}),
	saveBatchFileMeta: vi.fn(async (workspaceId: string, fileId: string, meta: Record<string, unknown>) => {
		state.fileMeta.set(fileKey(workspaceId, fileId), { ...meta });
	}),
}));

vi.mock("../../utils", () => ({
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("filesRoutes", () => {
	beforeEach(() => {
		resetState();
		vi.resetModules();
		vi.unstubAllGlobals();
	});

	it("stores ownership on upload, allows owned retrieval and proxies content, while listing stays unsupported", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method ?? "GET").toUpperCase();
				state.fetchCalls.push({
					url,
					method,
					headers: Object.fromEntries(new Headers(init?.headers).entries()),
				});

				if (url === "https://api.openai.example/v1/files" && method === "POST") {
					return jsonResponse({
						id: "file_123",
						object: "file",
						purpose: "batch",
						filename: "batch-input.jsonl",
						status: "uploaded",
						bytes: 17,
					});
				}

				if (url === "https://api.openai.example/v1/files/file_123" && method === "GET") {
					return jsonResponse({
						id: "file_123",
						object: "file",
						purpose: "batch",
						filename: "batch-input.jsonl",
						status: "processed",
						bytes: 23,
					});
				}

				if (url === "https://api.openai.example/v1/files/file_123/content" && method === "GET") {
					return new Response('{"ok":true}\n', {
						status: 200,
						headers: {
							"Content-Type": "application/jsonl",
							"Content-Disposition": 'attachment; filename="batch-output.jsonl"',
						},
					});
				}

				throw new Error(`Unexpected fetch: ${method} ${url}`);
			}),
		);

		const { filesRoutes } = await import("./files");

		const uploadBody = new FormData();
		uploadBody.set("purpose", "batch");
		uploadBody.set("file", new Blob(['{"ok":true}\n'], { type: "application/jsonl" }), "batch-input.jsonl");

		const uploadResponse = await filesRoutes.request("https://example.com/", {
			method: "POST",
			body: uploadBody,
		});

		expect(uploadResponse.status).toBe(200);
		expect(await uploadResponse.json()).toMatchObject({
			id: "file_123",
			purpose: "batch",
			status: "uploaded",
		});
		expect(state.fileMeta.get(fileKey("ws_files_test", "file_123"))).toMatchObject({
			provider: "openai",
			status: "uploaded",
			purpose: "batch",
			filename: "batch-input.jsonl",
			bytes: 17,
		});

		const listResponse = await filesRoutes.request("https://example.com/", {
			method: "GET",
		});

		expect(listResponse.status).toBe(400);
		expect(await listResponse.json()).toMatchObject({
			error: "not_supported",
			reason: "file_list_not_supported_with_shared_gateway_key",
		});

		const retrieveResponse = await filesRoutes.request("https://example.com/file_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(200);
		expect(await retrieveResponse.json()).toMatchObject({
			id: "file_123",
			status: "processed",
			bytes: 23,
		});
		expect(state.fileMeta.get(fileKey("ws_files_test", "file_123"))).toMatchObject({
			provider: "openai",
			status: "processed",
			purpose: "batch",
			filename: "batch-input.jsonl",
			bytes: 23,
		});

		const contentResponse = await filesRoutes.request("https://example.com/file_123/content", {
			method: "GET",
		});

		expect(contentResponse.status).toBe(200);
		expect(contentResponse.headers.get("content-type")).toBe("application/jsonl");
		expect(contentResponse.headers.get("content-disposition")).toBe('attachment; filename="batch-output.jsonl"');
		expect(await contentResponse.text()).toBe('{"ok":true}\n');
		expect(state.fetchCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST https://api.openai.example/v1/files",
			"GET https://api.openai.example/v1/files/file_123",
			"GET https://api.openai.example/v1/files/file_123/content",
		]);
	});

	it("rejects retrieval for files that are not owned by the workspace", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("Upstream fetch should not be called");
			}),
		);

		const { filesRoutes } = await import("./files");

		const retrieveResponse = await filesRoutes.request("https://example.com/file_missing_123", {
			method: "GET",
		});

		expect(retrieveResponse.status).toBe(404);
		expect(await retrieveResponse.json()).toMatchObject({
			error: "not_found",
			reason: "file_not_found_or_not_owned",
			file_id: "file_missing_123",
		});

		const contentResponse = await filesRoutes.request("https://example.com/file_missing_123/content", {
			method: "GET",
		});

		expect(contentResponse.status).toBe(404);
		expect(await contentResponse.json()).toMatchObject({
			error: "not_found",
			reason: "file_not_found_or_not_owned",
			file_id: "file_missing_123",
		});
		expect(state.fetchCalls).toEqual([]);
	});
});

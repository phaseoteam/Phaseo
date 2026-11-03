import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { execute } from "./index";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("Cloudflare transcription executor", () => {
	it("posts audio bytes to the native run endpoint and unwraps transcription output", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ CLOUDFLARE_ACCOUNT_ID: "account-123", CLOUDFLARE_API_TOKEN: "token-123" } as any);
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/ai/run/@cf/openai/whisper"),
			response: jsonResponse({ success: true, result: { text: "hello", language: "en" } }),
		}]);
		const result = await execute({
			ir: { model: "openai/whisper-1", file: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }) },
			requestId: "req-audio",
			workspaceId: "workspace",
			providerId: "cloudflare",
			providerModelSlug: "@cf/openai/whisper",
			endpoint: "audio.transcription",
			byokMeta: [],
			pricingCard: { rules: [] },
			meta: {},
		} as ExecutorExecuteArgs);
		expect(mock.calls).toHaveLength(1);
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") expect(result.ir).toMatchObject({ text: "hello", language: "en" });
		mock.restore();
	});

	it("maps Whisper Turbo JSON fields and detected language", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/ai/run/@cf/openai/whisper-large-v3-turbo"),
			response: jsonResponse({ success: true, result: { text: "bonjour", transcription_info: { language: "fr" } } }),
		}]);
		const result = await execute({
			ir: { model: "openai/whisper-large-v3-turbo", file: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), language: "fr", prompt: "names" },
			requestId: "req-turbo",
			workspaceId: "workspace",
			providerId: "cloudflare",
			providerModelSlug: "@cf/openai/whisper-large-v3-turbo",
			endpoint: "audio.transcription",
			byokMeta: [],
			pricingCard: { rules: [] },
			meta: {},
		} as ExecutorExecuteArgs);
		expect(mock.calls[0]?.bodyJson).toMatchObject({ audio: "AQID", language: "fr", initial_prompt: "names" });
		if (result.kind === "completed") expect(result.ir).toMatchObject({ text: "bonjour", language: "fr" });
		mock.restore();
	});

	describe("file_url downloads", () => {
		const urlArgs = () => ({
			ir: { model: "openai/whisper-1", fileUrl: "https://media.example/audio.mp3" },
			requestId: "req-url",
			workspaceId: "workspace",
			providerId: "cloudflare",
			providerModelSlug: "@cf/openai/whisper",
			endpoint: "audio.transcription",
			byokMeta: [],
			pricingCard: { rules: [] },
			meta: {},
		} as unknown as ExecutorExecuteArgs);

		afterEach(() => {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		});

		it("rejects an audio body larger than 25 MB without reading all of it", async () => {
			const chunk = new Uint8Array(1024 * 1024);
			let bytesServed = 0;
			const endlessBody = new ReadableStream<Uint8Array>({
				pull(controller) {
					bytesServed += chunk.byteLength;
					controller.enqueue(chunk);
				},
			});
			const fetchMock = vi.fn(async () => new Response(endlessBody, { status: 200, headers: { "content-type": "audio/mpeg" } }));
			vi.stubGlobal("fetch", fetchMock);

			const result = await execute(urlArgs());

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(bytesServed).toBeLessThanOrEqual(30 * 1024 * 1024);
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "file_too_large" });
		});

		it("rejects a declared Content-Length over 25 MB before reading the body", async () => {
			vi.stubGlobal("fetch", vi.fn(async () => new Response("x", {
				status: 200,
				headers: { "content-type": "audio/mpeg", "content-length": String(26 * 1024 * 1024) },
			})));

			const result = await execute(urlArgs());

			if (result.kind !== "completed") throw new Error("expected a completed result");
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "file_too_large" });
		});

		it("aborts a slow audio download and returns a 400", async () => {
			vi.useFakeTimers();
			vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
			})));

			const pending = execute(urlArgs());
			await vi.advanceTimersByTimeAsync(30_000);
			const result = await pending;

			if (result.kind !== "completed") throw new Error("expected a completed result");
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "invalid_file_url" });
		});

		it("rejects a private file_url without fetching it", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const result = await execute({ ...urlArgs(), ir: { model: "openai/whisper-1", fileUrl: "https://127.0.0.1/audio.mp3" } } as ExecutorExecuteArgs);

			expect(fetchMock).not.toHaveBeenCalled();
			if (result.kind !== "completed") throw new Error("expected a completed result");
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "invalid_file_url" });
		});
	});
});

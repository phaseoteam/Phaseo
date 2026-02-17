import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_openai_video_test",
		teamId: "team_test",
		providerId: "openai",
		endpoint: "video.generation",
		protocol: "openai.video",
		capability: "video.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("openai video executor", () => {
	it("forwards OpenAI Sora request fields and omits quality", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_openai_1", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "A storm over the ocean",
			seconds: 8,
			size: "1280x720",
			quality: "high",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toMatchObject({
			model: "openai/sora-2",
			prompt: "A storm over the ocean",
			seconds: 8,
			size: "1280x720",
		});
		expect(capturedBody?.quality).toBeUndefined();
	});

	it("maps input_image object to multipart input_reference", async () => {
		let sentForm: FormData | undefined;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://example.com/reference.png",
				response: new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "Content-Type": "image/png" },
				}),
			},
			{
				match: (url, init) => {
					if (!url.includes("/videos")) return false;
					const body = init?.body;
					if (body && typeof (body as any).get === "function") {
						sentForm = body as FormData;
					}
					return true;
				},
				response: jsonResponse({ id: "vid_openai_2", status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "Pan through a futuristic city",
			seconds: 6,
			size: "1280x720",
			inputImage: {
				url: "https://example.com/reference.png",
			},
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(sentForm).toBeDefined();
		expect(String(sentForm?.get("model"))).toBe("openai/sora-2");
		expect(String(sentForm?.get("prompt"))).toBe("Pan through a futuristic city");
		expect(String(sentForm?.get("seconds"))).toBe("6");
		expect(String(sentForm?.get("size"))).toBe("1280x720");
		const inputRef = sentForm?.get("input_reference");
		expect(inputRef).toBeTruthy();
	});
});

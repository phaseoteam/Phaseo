import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";

vi.mock("@providers/openai-compatible/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@providers/openai-compatible/config")>();
	return {
		...actual,
		resolveOpenAICompatKey: vi.fn(async () => ({ key: "test-minimax-key", source: "gateway", byokId: null })),
	};
});

import { execute as executeNonTextAdapter } from "./adapter-bridge";
import { encodeNonTextResponse } from "@pipeline/surfaces/non-text";

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

function run(endpoint: "images.generations" | "images.edits", body: Record<string, unknown>) {
	return executeNonTextAdapter({
		ir: { model: body.model, prompt: body.prompt, n: body.n, image: body.image, rawRequest: body },
		requestId: "req_h3_surface",
		workspaceId: "team_test",
		providerId: "minimax",
		endpoint,
		providerModelSlug: "MiniMax-H3-Image",
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as any);
}

describe("MiniMax H3-Image through the non-text surface", () => {
	it("forwards area and disable_prompt_enhanced from the public request", async () => {
		let sent: Record<string, unknown> | undefined;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({ data: [{ url: "https://cdn.example.com/a.jpeg" }], usage: { generated_images: 1 } }),
			onRequest: (call) => { sent = call.bodyJson; },
		}]);
		await run("images.generations", {
			model: "minimax/minimax-h3-image", prompt: "A fox", aspect_ratio: "3:4", area: "1K", disable_prompt_enhanced: true,
		});
		mock.restore();
		expect(sent).toMatchObject({ model: "MiniMax-H3-Image", aspect_ratio: "3:4", area: "1K", disable_prompt_enhanced: true });
	});

	it("forwards area on edits", async () => {
		let sent: Record<string, unknown> | undefined;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/edits"),
			response: jsonResponse({ data: [{ url: "https://cdn.example.com/e.jpeg" }], usage: { generated_images: 1 } }),
			onRequest: (call) => { sent = call.bodyJson; },
		}]);
		await run("images.edits", { model: "minimax/minimax-h3-image", prompt: "Make it night", image: "https://example.com/a.jpg", area: "2K" });
		mock.restore();
		expect(sent).toMatchObject({ area: "2K", images: [{ image_url: "https://example.com/a.jpg" }] });
	});

	it("reports image output tokens as output_tokens in the public usage", async () => {
		// The usage MiniMax returned for a live 1K request on 2026-11-10.
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({
				data: [{ url: "https://cdn.example.com/fox.jpeg" }],
				usage: {
					generated_images: 1, total_tokens: 6388, input_tokens: 2284, output_tokens: 4104,
					input_tokens_details: { text_tokens: 2284, image_tokens: 0 },
					output_tokens_details: { image_tokens: 4104 },
				},
			}),
		}]);
		const result = await run("images.generations", { model: "minimax/minimax-h3-image", prompt: "A fox" });
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		const encoded = encodeNonTextResponse("images.generations", result.ir as any, "req_h3_surface");
		expect(encoded.usage).toMatchObject({ input_tokens: 2284, output_tokens: 4104, total_tokens: 6388 });
	});

	it("keeps per-image failures from a partial result in the public response", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({
				data: [
					{ url: "https://cdn.example.com/ok.jpeg", revised_prompt: "A red fox" },
					{ error: { code: "1027", message: "output image failed content safety check" } },
				],
				usage: { generated_images: 1 },
			}),
		}]);
		const result = await run("images.generations", { model: "minimax/minimax-h3-image", prompt: "A fox", n: 2 });
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		const encoded = encodeNonTextResponse("images.generations", result.ir as any, "req_h3_surface");
		expect(encoded.data).toEqual([{ url: "https://cdn.example.com/ok.jpeg", revised_prompt: "A red fox" }]);
		expect(encoded.errors).toEqual([{ index: 1, code: "1027", message: "output image failed content safety check" }]);
	});
});

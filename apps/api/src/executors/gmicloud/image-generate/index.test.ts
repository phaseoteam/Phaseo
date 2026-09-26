import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { execute } from ".";

function args(image?: Array<string | Blob>): ExecutorExecuteArgs {
	return {
		ir: { model: "tencent/hy-image-v3.5-preview:free", prompt: "A blue mug", size: "2048x2048", ...(image ? { image } : {}) },
		requestId: "req_hy_image_test", workspaceId: "team_test", providerId: "gmicloud",
		endpoint: image ? "images.edits" : "images.generations", capability: image ? "image.edit" : "image.generate",
		protocol: "gmicloud.native", providerModelSlug: "hy-image-v3.5-preview",
		capabilityParams: null, byokMeta: [], pricingCard: null, meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("GMI Cloud Hy Image 3.5", () => {
	it("generates through the request queue and returns an image URL", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url, init) => url.endsWith("/api/v1/ie/requestqueue/apikey/requests") && init?.method === "POST",
			response: jsonResponse({ request_id: "hy_req_1", status: "success", outcome: { image_url: "https://gmi.example/image.png" } }),
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		try {
			const request = args();
			request.meta.returnUpstreamRequest = true;
			const result = await execute(request);
			expect(body).toEqual({ model: "hy-image-v3.5-preview", payload: { prompt: "A blue mug", size: "2048x2048", generate_max_pixels: 4194304 } });
			expect((result.ir as any)?.data).toEqual([{ url: "https://gmi.example/image.png", b64Json: null, revisedPrompt: null }]);
			expect(JSON.parse(result.mappedRequest ?? "{}")).toEqual(body);
		} finally { mock.restore(); }
	});

	it("passes up to five reference URLs for editing", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url, init) => url.endsWith("/api/v1/ie/requestqueue/apikey/requests") && init?.method === "POST",
			response: jsonResponse({ request_id: "hy_req_2", status: "success", outcome: { media_urls: [{ url: "https://gmi.example/edit.png" }] } }),
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		try {
			const result = await execute(args(["https://example.com/mug.png"]));
			expect(body.payload.image).toEqual(["https://example.com/mug.png"]);
			expect((result.ir as any)?.data[0].url).toBe("https://gmi.example/edit.png");
		} finally { mock.restore(); }
	});

	it("encodes an uploaded reference image for editing", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url, init) => url.endsWith("/api/v1/ie/requestqueue/apikey/requests") && init?.method === "POST",
			response: jsonResponse({ request_id: "hy_req_upload", status: "success", outcome: { media_urls: [{ url: "https://gmi.example/edit.png" }] } }),
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		try {
			const upload = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
			const result = await execute(args([upload]));
			expect(body.payload.image[0]).toMatch(/^data:image\/png;base64,/);
			expect((result.ir as any)?.data[0].url).toBe("https://gmi.example/edit.png");
		} finally { mock.restore(); }
	});

	it("rejects more than five references before submitting", async () => {
		const result = await execute(args(Array(6).fill("https://example.com/mug.png")));
		expect(result.upstream.status).toBe(400);
		expect(result.kind === "completed" && result.terminal).toBe(true);
		expect(result.kind === "completed" && result.localClientError).toBe(true);
	});
});

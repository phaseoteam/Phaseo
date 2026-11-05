// Purpose: Wire-level checks for image parameters that differ by provider.
// Why: GPT Image 2.6 `complexity` must reach OpenAI, and Together takes width/height and `base64`.
// How: Run the image endpoints against a mocked fetch and inspect the upstream body.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec as execImages } from "../endpoints/images";
import { exec as execImageEdits } from "../endpoints/images-edits";

const REQUEST_META = {
	requestId: "req_test_image_params",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const TOGETHER_PIXEL_CARD = {
	key: "together:qwen/qwen-image:image.generate",
	currency: "USD",
	rules: [{ meter: "image_pixels", unit: "pixel", unit_size: 1_000_000, price_per_unit: 0.0058, pricing_plan: "standard" }],
};

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

async function runTogether(body: Record<string, unknown>) {
	let capturedBody: any = null;
	let called = false;
	const mock = installFetchMock([{
		match: (url) => url.includes("/images/generations"),
		response: jsonResponse({ id: "img", model: "Qwen/Qwen-Image", object: "list", data: [{ index: 0, b64_json: "abc", type: "b64_json" }] }),
		onRequest: (call) => {
			called = true;
			capturedBody = call.bodyJson;
		},
	}]);
	const result = await execImages({
		endpoint: "images.generations",
		model: "qwen/qwen-image",
		body: { model: "qwen/qwen-image", prompt: "A poster", ...body },
		meta: REQUEST_META,
		workspaceId: "team_test",
		providerId: "together",
		byokMeta: [],
		pricingCard: TOGETHER_PIXEL_CARD,
		providerModelSlug: "Qwen/Qwen-Image",
		stream: false,
	} as any);
	mock.restore();
	return { result, capturedBody, called };
}

describe("GPT Image 2.6 complexity", () => {
	it("forwards complexity on generations", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.includes("/images/generations"),
			response: jsonResponse({ created: 1, data: [{ b64_json: "abc" }] }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);
		await execImages({
			endpoint: "images.generations",
			model: "openai/gpt-image-2.6-flare",
			body: { model: "openai/gpt-image-2.6-flare", prompt: "A lighthouse", complexity: "low" },
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "gpt-image-2.6-flare",
			stream: false,
		} as any);
		mock.restore();
		expect(capturedBody.complexity).toBe("low");
	});

	it("forwards complexity on edits", async () => {
		let complexity: string | null = null;
		const mock = installFetchMock([{
			match: (url, init) => {
				if (!url.includes("/images/edits")) return false;
				const form = init?.body as FormData | undefined;
				if (form && typeof (form as any).get === "function") complexity = String(form.get("complexity") ?? "");
				return true;
			},
			response: jsonResponse({ created: 1, data: [{ b64_json: "abc" }] }),
		}]);
		await execImageEdits({
			endpoint: "images.edits",
			model: "openai/gpt-image-2.6-sunburst",
			body: {
				model: "openai/gpt-image-2.6-sunburst",
				image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
				prompt: "Change the sign",
				complexity: "medium",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "gpt-image-2.6-sunburst",
			stream: false,
		} as any);
		mock.restore();
		expect(complexity).toBe("medium");
	});
});

describe("Together image wire format", () => {
	it("sends a WIDTHxHEIGHT size as width and height and bills those pixels", async () => {
		const { result, capturedBody } = await runTogether({ size: "1536x1024" });
		expect(capturedBody).toMatchObject({ width: 1536, height: 1024 });
		expect(capturedBody).not.toHaveProperty("size");
		expect(result.bill.usage?.image_pixels).toBe(1536 * 1024);
	});

	it("lets explicit width and height win over size", async () => {
		const { result, capturedBody } = await runTogether({ size: "1536x1024", width: 800, height: 600 });
		expect(capturedBody).toMatchObject({ width: 800, height: 600 });
		expect(capturedBody).not.toHaveProperty("size");
		expect(result.bill.usage?.image_pixels).toBe(800 * 600);
	});

	it("maps response_format b64_json to Together's base64 and keeps url", async () => {
		const b64 = await runTogether({ response_format: "b64_json" });
		expect(b64.capturedBody.response_format).toBe("base64");
		expect(b64.result.normalized?.data?.[0]?.b64_json).toBe("abc");
		const url = await runTogether({ response_format: "url" });
		expect(url.capturedBody.response_format).toBe("url");
	});

	it("rejects a size Together cannot use before calling it", async () => {
		const { result, called } = await runTogether({ size: "16:9" });
		expect(called).toBe(false);
		expect(result.upstream.status).toBe(400);
		const body = await result.upstream.json();
		expect(body.error.param).toBe("size");
	});

	it("ignores size auto and uses Together's 1024 default", async () => {
		const { result, capturedBody, called } = await runTogether({ size: "auto" });
		expect(called).toBe(true);
		expect(capturedBody).not.toHaveProperty("size");
		expect(capturedBody).not.toHaveProperty("width");
		expect(result.bill.usage?.image_pixels).toBe(1024 * 1024);
	});

	it("does not touch size or response_format for OpenAI", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.includes("/images/generations"),
			response: jsonResponse({ created: 1, data: [{ url: "https://example.com/a.png" }] }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);
		await execImages({
			endpoint: "images.generations",
			model: "openai/dall-e-3",
			body: { model: "openai/dall-e-3", prompt: "A", size: "1024x1024", response_format: "b64_json" },
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "dall-e-3",
			stream: false,
		} as any);
		mock.restore();
		expect(capturedBody).toMatchObject({ size: "1024x1024", response_format: "b64_json" });
		expect(capturedBody).not.toHaveProperty("width");
	});
});

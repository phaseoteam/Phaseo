import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("../../openai-compatible/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../openai-compatible/config")>();
	return {
		...actual,
		resolveOpenAICompatKey: vi.fn(async () => ({ key: "test-byteplus-key", source: "gateway", byokId: null })),
	};
});

import { exec } from "./images";

const META = { requestId: "req_byteplus_images", apiKeyId: "key_test", apiKeyRef: "kid_test", apiKeyKid: "kid_test" };

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());
afterEach(() => vi.restoreAllMocks());

function args(endpoint: "images.generations" | "images.edits", body: Record<string, unknown>, pricingCard: any = null) {
	return {
		endpoint,
		model: "bytedance/seedream-5.0-pro",
		providerModelSlug: "dola-seedream-5-0-pro-260628",
		body: { model: "bytedance/seedream-5.0-pro", prompt: "Create a poster", ...body },
		meta: META,
		workspaceId: "team_test",
		providerId: "byteplus",
		byokMeta: [],
		pricingCard,
		stream: false,
	} as any;
}

describe("BytePlus image adapter", () => {
	it("sends the request through the upstream timing tracker, so a 2xx is not retried elsewhere", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/api/v3/images/generations"),
			response: jsonResponse({ data: [{ url: "https://example.com/output.png" }] }),
		}]);
		const upstreamFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
		await exec({ ...args("images.generations", { size: "1024x1024" }), upstreamTiming: { fetch: upstreamFetch } });
		mock.restore();
		expect(upstreamFetch).toHaveBeenCalledTimes(1);
	});

	it("routes generation through ModelArk with the provider-native model slug", async () => {
		let requestBody: any;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/api/v3/images/generations"),
			response: jsonResponse({ data: [{ url: "https://example.com/output.png" }] }),
			onRequest: (call) => { requestBody = call.bodyJson; },
		}]);

		const result = await exec(args("images.generations", { size: "1024x1024", n: 1 }));
		mock.restore();

		expect(requestBody).toMatchObject({ model: "dola-seedream-5-0-pro-260628", prompt: "Create a poster", size: "1024x1024" });
		expect(requestBody).not.toHaveProperty("image");
		expect(requestBody).not.toHaveProperty("n");
		expect(result.normalized.data).toHaveLength(1);
		expect(result.normalized.created).toEqual(expect.any(Number));
	});

	it("maps edit references and bills successful input and output images", async () => {
		let requestBody: any;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/api/v3/images/generations"),
			response: jsonResponse({ data: [{ url: "https://example.com/one.png" }, { url: "https://example.com/two.png" }] }),
			onRequest: (call) => { requestBody = call.bodyJson; },
		}]);
		const pricingCard = {
			provider: "byteplus", model: "bytedance/seedream-5.0-pro", endpoint: "images.edits",
			effective_from: null, effective_to: null, currency: "USD", version: null,
			rules: [
				{ meter: "input_image", unit: "image", unit_size: 1, price_per_unit: 0.003, currency: "USD", pricing_plan: "standard", match: [], priority: 250, included_quantity: 1 },
				{ meter: "output_image", unit: "image", unit_size: 1, price_per_unit: 0.045, currency: "USD", pricing_plan: "standard", match: [], priority: 200 },
			],
		};

		const result = await exec(args("images.edits", { image: ["data:image/png;base64,one", "data:image/png;base64,two", "data:image/png;base64,three"], n: 1 }, pricingCard));
		mock.restore();

		expect(requestBody.image).toHaveLength(3);
		expect(result.bill.usage).toMatchObject({ input_image: 3, output_image: 2 });
		expect(result.bill.usage?.pricing.total_nanos).toBe(96_000_000);
		expect(result.bill.cost_cents).toBe(9);
	});

	it("rejects unsupported multiple outputs without contacting BytePlus", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const result = await exec(args("images.generations", { n: 2 }));

		expect(result.upstream.status).toBe(400);
		expect(result.normalized).toMatchObject({ error: { param: "n" } });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("turns the watermark off by default and on when provider_params asks for it", async () => {
		const bodies: any[] = [];
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/api/v3/images/generations"),
			response: () => jsonResponse({ data: [{ url: "https://example.com/output.png" }] }),
			onRequest: (call) => { bodies.push(call.bodyJson); },
		}]);

		await exec(args("images.generations", {}));
		await exec(args("images.generations", { provider_params: { byteplus: { watermark: true } } }));
		mock.restore();

		expect(bodies[0].watermark).toBe(false);
		expect(bodies[1].watermark).toBe(true);
	});

	it("rejects multiple outputs when routing falls back to the canonical model ID", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const request = args("images.generations", { n: 2 });
		request.providerModelSlug = null;

		const result = await exec(request);

		expect(result.upstream.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

function familyArgs(providerModelSlug: string, endpoint: "images.generations" | "images.edits", body: Record<string, unknown>) {
	const request = args(endpoint, body);
	request.providerModelSlug = providerModelSlug;
	return request;
}

async function capture(request: any): Promise<{ body: any; result: any }> {
	let body: any;
	const mock = installFetchMock([{
		match: (url) => url.endsWith("/api/v3/images/generations"),
		response: () => jsonResponse({ data: [{ url: "https://example.com/output.png" }] }),
		onRequest: (call) => { body = call.bodyJson; },
	}]);
	try {
		const result = await exec(request);
		return { body, result };
	} finally {
		mock.restore();
	}
}

async function expectRejected(request: any, param: string) {
	const fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
	const result = await exec(request);
	vi.unstubAllGlobals();
	expect(result.upstream.status).toBe(400);
	expect(result.normalized).toMatchObject({ error: { type: "invalid_request_error", param } });
	expect(fetchMock).not.toHaveBeenCalled();
	return result;
}

describe("BytePlus Seedream capability table", () => {
	it("maps Seedream 5.5 transparent PNG output, prompt optimization and safety_identifier", async () => {
		const { body } = await capture(familyArgs("dola-seedream-5-5-261028", "images.generations", {
			size: "1.5k",
			background: "transparent",
			output_format: "png",
			prompt_optimizer: true,
			provider_params: { byteplus: { safety_identifier: "user-hash-1" } },
		}));

		expect(body).toEqual({
			model: "dola-seedream-5-5-261028",
			prompt: "Create a poster",
			size: "1.5K",
			background: "transparent",
			output_format: "png",
			optimize_prompt_options: { mode: "standard" },
			safety_identifier: "user-hash-1",
			watermark: false,
		});
	});

	it("keeps alpha on Seedream 5.5 transparent output without a reference image or explicit format", async () => {
		const { body } = await capture(familyArgs("dola-seedream-5-5-261028", "images.generations", { background: "transparent" }));
		expect(body).toMatchObject({ background: "transparent", output_format: "png" });
		expect(body).not.toHaveProperty("image");
	});

	it.each([
		["JPEG with a transparent background", { background: "transparent", output_format: "jpeg" }, "output_format"],
		["fast prompt optimization", { provider_params: { byteplus: { optimize_prompt_options: { mode: "fast" } } } }, "prompt_optimizer"],
		["more than one output", { n: 2 }, "n"],
		["seed", { seed: 7 }, "seed"],
		["streaming", { stream: true }, "stream"],
		["webp output", { output_format: "webp" }, "output_format"],
		["a size below the pixel range", { size: "512x512" }, "size"],
		["an aspect ratio beyond 16:1", { size: "8600x500" }, "size"],
		["a 4K preset", { size: "4K" }, "size"],
	])("rejects %s on Seedream 5.5 before calling BytePlus", async (_label, body, param) => {
		await expectRejected(familyArgs("dola-seedream-5-5-261028", "images.generations", body), param);
	});

	it("rejects more than ten reference images on Seedream 5.5", async () => {
		const image = Array.from({ length: 11 }, (_, index) => `https://example.com/${index}.png`);
		await expectRejected(familyArgs("dola-seedream-5-5-261028", "images.edits", { image }), "image");
	});

	it("maps Seedream 5.0 Pro fast prompt optimization and JPEG output", async () => {
		const { body } = await capture(familyArgs("dola-seedream-5-0-pro-260628", "images.generations", {
			size: "2048x1024",
			output_format: "jpeg",
			provider_params: { byteplus: { optimize_prompt_options: { mode: "fast" } } },
		}));
		expect(body).toMatchObject({ size: "2048x1024", output_format: "jpeg", optimize_prompt_options: { mode: "fast" }, watermark: false });
		expect(body).not.toHaveProperty("sequential_image_generation");
	});

	it("requires exactly one reference image for Seedream 5.0 transparent output", async () => {
		await expectRejected(familyArgs("dola-seedream-5-0-flash-260915", "images.generations", { background: "transparent" }), "background");

		const { body } = await capture(familyArgs("dola-seedream-5-0-flash-260915", "images.edits", {
			image: "https://example.com/alpha.png",
			background: "transparent",
		}));
		expect(body).toMatchObject({ image: "https://example.com/alpha.png", background: "transparent", output_format: "png" });
	});

	it("rejects fast prompt optimization and safety_identifier on Seedream 5.0 Flash", async () => {
		await expectRejected(familyArgs("dola-seedream-5-0-flash-260915", "images.generations", {
			provider_params: { byteplus: { optimize_prompt_options: { mode: "fast" } } },
		}), "prompt_optimizer");
		await expectRejected(familyArgs("dola-seedream-5-0-flash-260915", "images.generations", {
			provider_params: { byteplus: { safety_identifier: "user-hash-1" } },
		}), "safety_identifier");
	});

	it("maps n onto sequential image generation for Seedream 5.0 Lite", async () => {
		const { body } = await capture(familyArgs("seedream-5-0-260128", "images.generations", { n: 4, size: "2K", output_format: "png" }));
		expect(body).toMatchObject({
			model: "seedream-5-0-260128",
			size: "2K",
			output_format: "png",
			sequential_image_generation: "auto",
			sequential_image_generation_options: { max_images: 4 },
			watermark: false,
		});
		expect(body).not.toHaveProperty("n");
	});

	it("rejects references plus outputs above fifteen on Seedream 4.5", async () => {
		const image = Array.from({ length: 10 }, (_, index) => `https://example.com/${index}.png`);
		await expectRejected(familyArgs("seedream-4-5-251128", "images.edits", { image, n: 6, size: "2K" }), "n");
	});

	it("rejects output_format, background and sizes under the pixel floor on Seedream 4.5", async () => {
		await expectRejected(familyArgs("seedream-4-5-251128", "images.generations", { output_format: "png" }), "output_format");
		await expectRejected(familyArgs("seedream-4-5-251128", "images.generations", { background: "transparent" }), "background");
		await expectRejected(familyArgs("seedream-4-5-251128", "images.generations", { size: "1024x1024" }), "size");
	});

	it("maps Seedream 4.0 sizes, fast prompt optimization and group generation", async () => {
		const { body } = await capture(familyArgs("seedream-4-0-250828", "images.generations", {
			size: "1600x600",
			n: 3,
			background: "auto",
			provider_params: { byteplus: { optimize_prompt_options: { mode: "fast" } } },
		}));
		expect(body).toMatchObject({
			size: "1600x600",
			optimize_prompt_options: { mode: "fast" },
			sequential_image_generation: "auto",
			sequential_image_generation_options: { max_images: 3 },
		});
		expect(body).not.toHaveProperty("background");
	});

	it("resolves the family from canonical model IDs when no provider slug is set", async () => {
		const request = familyArgs("unused", "images.generations", { output_format: "png" });
		request.providerModelSlug = null;
		request.model = "bytedance/seedream-4.5";
		await expectRejected(request, "output_format");
	});

	it("keeps today's pass-through for unknown ModelArk image models", async () => {
		const { body } = await capture(familyArgs("seedream-3-0-t2i-250415", "images.generations", {
			size: "512x512",
			n: 2,
			seed: 7,
			output_format: "webp",
			background: "transparent",
		}));
		expect(body).toEqual({
			model: "seedream-3-0-t2i-250415",
			prompt: "Create a poster",
			size: "512x512",
			n: 2,
			watermark: false,
		});
	});

	it("rejects a non-boolean watermark", async () => {
		await expectRejected(familyArgs("dola-seedream-5-5-261028", "images.generations", {
			provider_params: { byteplus: { watermark: "no" } },
		}), "watermark");
	});
});

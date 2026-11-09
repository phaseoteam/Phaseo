import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { parameterValueIssues } from "@pipeline/before/paramValueSupport";

vi.mock("../../openai-compatible/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../openai-compatible/config")>();
	return {
		...actual,
		resolveOpenAICompatKey: vi.fn(async () => ({ key: "test-byteplus-key", source: "gateway", byokId: null })),
	};
});

import { exec, resolveSeedreamFamily } from "./images";

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
		const { body, result } = await capture(args("images.generations", { size: "1024x1024", n: 1 }));

		expect(body).toMatchObject({ model: "dola-seedream-5-0-pro-260628", prompt: "Create a poster", size: "1024x1024" });
		expect(body).not.toHaveProperty("image");
		expect(body).not.toHaveProperty("n");
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

	it("turns the watermark off by default and on when provider_params asks for it", async () => {
		const first = await capture(args("images.generations", {}));
		const second = await capture(args("images.generations", { provider_params: { byteplus: { watermark: true } } }));
		const unknown = await capture(familyArgs("seedream-3-0-t2i-250415", "images.generations", {}));

		expect(first.body.watermark).toBe(false);
		expect(second.body.watermark).toBe(true);
		expect(unknown.body.watermark).toBe(false);
	});
});

describe("BytePlus Seedream field mapping", () => {
	it("resolves families from provider slugs and canonical ids", () => {
		expect(resolveSeedreamFamily("dola-seedream-5-5-261028")).toBe("seedream-5.5");
		expect(resolveSeedreamFamily("dola-seedream-5-0-pro-260628")).toBe("seedream-5.0-pro");
		expect(resolveSeedreamFamily("dola-seedream-5-0-flash-260915")).toBe("seedream-5.0-flash");
		expect(resolveSeedreamFamily("seedream-5-0-260128")).toBe("seedream-5.0-lite");
		expect(resolveSeedreamFamily("bytedance/seedream-4.5")).toBe("seedream-4.5");
		expect(resolveSeedreamFamily("seedream-4-0-250828")).toBe("seedream-4.0");
		expect(resolveSeedreamFamily("seedream-3-0-t2i-250415")).toBeNull();
	});

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

	it("asks for PNG when a transparent background has no explicit format", async () => {
		const { body } = await capture(familyArgs("dola-seedream-5-5-261028", "images.generations", { background: "transparent" }));
		expect(body).toMatchObject({ background: "transparent", output_format: "png" });
	});

	it("leaves the background out when it is auto", async () => {
		const { body } = await capture(familyArgs("dola-seedream-5-5-261028", "images.generations", { background: "auto" }));
		expect(body).not.toHaveProperty("background");
		expect(body).not.toHaveProperty("output_format");
	});

	it("forwards native prompt optimization options and an explicit output format as given", async () => {
		const { body } = await capture(familyArgs("dola-seedream-5-0-pro-260628", "images.generations", {
			size: "2048x1024",
			output_format: "jpeg",
			provider_params: { byteplus: { optimize_prompt_options: { mode: "fast" } } },
		}));
		expect(body).toMatchObject({ size: "2048x1024", output_format: "jpeg", optimize_prompt_options: { mode: "fast" }, watermark: false });
	});

	it("does not send seed, stream or n to known Seedream models", async () => {
		const { body } = await capture(familyArgs("dola-seedream-5-5-261028", "images.generations", { seed: 7, stream: true, n: 2, prompt_optimizer: false }));
		expect(body).not.toHaveProperty("seed");
		expect(body).not.toHaveProperty("stream");
		expect(body).not.toHaveProperty("n");
		expect(body).not.toHaveProperty("sequential_image_generation");
		expect(body).not.toHaveProperty("optimize_prompt_options");
	});

	it.each([
		["seedream-5-0-260128", 4],
		["seedream-4-5-251128", 3],
		["seedream-4-0-250828", 2],
	])("maps n onto group generation for %s", async (slug, n) => {
		const { body } = await capture(familyArgs(slug, "images.generations", { n }));
		expect(body).toMatchObject({ sequential_image_generation: "auto", sequential_image_generation_options: { max_images: n } });
		expect(body).not.toHaveProperty("n");
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
});

// The catalogue, not this adapter, says what each route accepts. These are the
// specs stored for byteplus:bytedance/seedream-5.5 image.generate on 2026-11-09.
const SEEDREAM_5_5_SPECS = {
	n: { type: "integer", values: [1], default: 1, supported: true },
	seed: { supported: false },
	size: { type: "string", values: ["1K", "1.5K", "2K"], default: "2K", supported: true, dimensions: { max_pixels: 4624220, min_pixels: 921600, max_aspect_ratio: "16:1" } },
	prompt: { type: "string", required: true, supported: true },
	stream: { supported: false },
	background: {
		type: "string",
		values: ["auto", "transparent"],
		default: "auto",
		supported: true,
		when: [{ if: { output_format: ["jpeg"] }, values: ["auto"], message: "Transparent backgrounds need output_format png." }],
	},
	output_format: { type: "string", values: ["png", "jpeg"], supported: true },
	prompt_optimizer: { type: "boolean", values: [true], supported: true, upstream_name: "optimize_prompt_options.mode" },
};

describe("Seedream 5.5 catalogue specs in routing", () => {
	const route = { capabilityParams: SEEDREAM_5_5_SPECS as Record<string, any> };

	it("accepts transparent PNG output", () => {
		expect(parameterValueIssues(route, { background: "transparent", output_format: "png" }, "images.generations")).toEqual([]);
	});

	it("flags JPEG with a transparent background, webp, several outputs and disabling prompt optimization", () => {
		expect(parameterValueIssues(route, { background: "transparent", output_format: "jpeg" }, "images.generations")).toEqual([
			expect.objectContaining({ param: "background", reason: "not_allowed", allowed: ["auto"] }),
		]);
		expect(parameterValueIssues(route, { output_format: "webp" }, "images.generations")[0]).toMatchObject({ param: "output_format", reason: "not_allowed" });
		expect(parameterValueIssues(route, { n: 2 }, "images.generations")[0]).toMatchObject({ param: "n", reason: "not_allowed" });
		expect(parameterValueIssues(route, { prompt_optimizer: false }, "images.generations")[0]).toMatchObject({ param: "prompt_optimizer", reason: "not_allowed" });
	});
});

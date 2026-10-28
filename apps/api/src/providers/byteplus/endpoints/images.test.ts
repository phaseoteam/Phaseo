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

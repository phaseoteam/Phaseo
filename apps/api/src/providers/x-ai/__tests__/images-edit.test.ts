import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec } from "../endpoints/images-edit";

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

describe("xAI image editing", () => {
	it("uses the native JSON image object rather than OpenAI multipart", async () => {
		let request: any;
		const mock = installFetchMock([{ match: (url) => url === "https://api.x.ai/v1/images/edits", response: jsonResponse({ data: [{ url: "https://imgen.x.ai/output.jpeg", mime_type: "image/jpeg" }], usage: { cost_in_usd_ticks: 200000000 } }), onRequest: (call) => { request = call.bodyJson; } }]);
		const result = await exec({ endpoint: "images.edits", model: "spacex-ai/grok-imagine-image-quality", body: { model: "spacex-ai/grok-imagine-image-quality", prompt: "Pencil sketch", image: "https://example.com/input.png", n: 1 }, meta: { requestId: "req_xai_edit", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" }, workspaceId: "team_test", providerId: "x-ai", byokMeta: [], pricingCard: null, providerModelSlug: "grok-imagine-image-quality", stream: false } as any);
		mock.restore();
		expect(request).toEqual({ model: "grok-imagine-image-quality", prompt: "Pencil sketch", image: { url: "https://example.com/input.png" }, n: 1 });
		expect(result.normalized?.data[0].url).toContain("imgen.x.ai");
	});

	it("passes Grok Imagine Image 2.0 controls and multi-image inputs", async () => {
		let request: any;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.x.ai/v1/images/edits",
			response: jsonResponse({ data: [{ url: "https://imgen.x.ai/output.jpeg" }] }),
			onRequest: (call) => { request = call.bodyJson; },
		}]);
		const result = await exec({
			endpoint: "images.edits",
			model: "spacex-ai/grok-imagine-image-2.0",
			body: {
				model: "spacex-ai/grok-imagine-image-2.0",
				prompt: "Combine the references into one scene",
				image: ["https://example.com/one.png", "https://example.com/two.png"],
				aspect_ratio: "21:9",
				resolution: "2k",
				quality: "medium",
			},
			meta: { requestId: "req_xai_multi_edit", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
			workspaceId: "team_test",
			providerId: "x-ai",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "grok-imagine-image-2.0",
			stream: false,
		} as any);
		mock.restore();

		expect(request).toEqual({
			model: "grok-imagine-image-2.0",
			prompt: "Combine the references into one scene",
			images: [
				{ type: "image_url", url: "https://example.com/one.png" },
				{ type: "image_url", url: "https://example.com/two.png" },
			],
			quality: "medium",
			aspect_ratio: "21:9",
			resolution: "2k",
		});
		expect(result.normalized?.data[0].url).toContain("imgen.x.ai");
	});

	it("rejects more than five Grok Imagine Image 2.0 source images", async () => {
		const result = await exec({
			endpoint: "images.edits",
			model: "spacex-ai/grok-imagine-image-2.0",
			body: {
				model: "spacex-ai/grok-imagine-image-2.0",
				prompt: "edit",
				image: ["1", "2", "3", "4", "5", "6"],
			},
			meta: { requestId: "req_xai_too_many", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
			workspaceId: "team_test",
			providerId: "x-ai",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "grok-imagine-image-2.0",
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
	});

	it("keeps legacy Grok image editing single-image only", async () => {
		const mock = installFetchMock([]);
		const result = await exec({
			endpoint: "images.edits",
			model: "spacex-ai/grok-imagine-image",
			body: {
				model: "spacex-ai/grok-imagine-image",
				prompt: "edit",
				image: ["1", "2"],
			},
			meta: { requestId: "req_xai_legacy_multi", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
			workspaceId: "team_test",
			providerId: "x-ai",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "grok-imagine-image",
			stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(400);
	});

	it("prices each source image in a multi-image edit", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.x.ai/v1/images/edits",
			response: jsonResponse({ data: [{ url: "https://imgen.x.ai/output.jpeg" }] }),
		}]);
		const result = await exec({
			endpoint: "images.edits",
			model: "spacex-ai/grok-imagine-image-2.0",
			body: {
				model: "spacex-ai/grok-imagine-image-2.0",
				prompt: "Combine the references",
				image: ["https://example.com/one.png", "https://example.com/two.png"],
				quality: "low",
				resolution: "1k",
			},
			meta: { requestId: "req_xai_priced_multi_edit", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
			workspaceId: "team_test",
			providerId: "x-ai",
			byokMeta: [],
			pricingCard: {
				key: "spacex-ai:spacex-ai/grok-imagine-image-2.0:image.edit",
				currency: "USD",
				rules: [
					{ meter: "input_image", unit: "image", unit_size: 1, price_per_unit: 0.01, pricing_plan: "standard" },
					{ meter: "output_image", unit: "image", unit_size: 1, price_per_unit: 0.04, pricing_plan: "standard", match: [{ path: "image_params.resolution", op: "eq", value: "1k" }, { path: "image_params.quality", op: "eq", value: "low" }] },
				],
			},
			providerModelSlug: "grok-imagine-image-2.0",
			stream: false,
		} as any);
		mock.restore();

		expect(result.bill.usage?.input_image).toBe(2);
		expect(result.bill.usage?.pricing?.lines).toEqual(expect.arrayContaining([
			expect.objectContaining({ dimension: "input_image", line_nanos: 20_000_000 }),
		]));
	});

	it("rejects conflicting size aliases before calling xAI", async () => {
		let called = false;
		const result = await exec({
			endpoint: "images.edits", model: "gateway/image-edit-alias",
			body: { model: "gateway/image-edit-alias", prompt: "edit", image: "https://example.com/input.png", size: "3k", resolution: "2k" },
			meta: { requestId: "req_xai_conflict", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
			workspaceId: "team_test", providerId: "x-ai", byokMeta: [], pricingCard: null,
			providerModelSlug: "grok-imagine-image-2.0", stream: false,
			upstreamTiming: { fetch: async () => { called = true; return jsonResponse({ data: [] }); } },
		} as any);

		expect(result.upstream.status).toBe(400);
		expect(called).toBe(false);
	});

	it("uses the size alias consistently for xAI and billing", async () => {
		let request: any;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.x.ai/v1/images/edits",
			response: jsonResponse({ data: [{ url: "https://imgen.x.ai/output.jpeg" }] }),
			onRequest: (call) => { request = call.bodyJson; },
		}]);
		const result = await exec({
			endpoint: "images.edits", model: "spacex-ai/grok-imagine-image-2.0",
			body: { model: "spacex-ai/grok-imagine-image-2.0", prompt: "edit", image: "https://example.com/input.png", size: "2K", quality: "medium" },
			meta: { requestId: "req_xai_size_alias", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
			workspaceId: "team_test", providerId: "x-ai", byokMeta: [],
			pricingCard: { rules: [
				{ meter: "input_image", unit: "image", unit_size: 1, price_per_unit: 0.01, currency: "USD", pricing_plan: "standard", match: [], priority: 100 },
				{ meter: "output_image", unit: "image", unit_size: 1, price_per_unit: 0.08, currency: "USD", pricing_plan: "standard", match: [
					{ path: "image_params.resolution", op: "eq", value: "2k" },
					{ path: "image_params.quality", op: "eq", value: "medium" },
				], priority: 100 },
			] },
			providerModelSlug: "grok-imagine-image-2.0", stream: false,
		} as any);
		mock.restore();

		expect(request.resolution).toBe("2k");
		expect(result.bill.cost_cents).toBe(9);
	});

	it("prices Grok Imagine Image 2.0 defaults after resolving a model alias", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.x.ai/v1/images/edits",
			response: jsonResponse({ data: [{ url: "https://imgen.x.ai/output.jpeg" }] }),
		}]);
		const result = await exec({
			endpoint: "images.edits", model: "gateway/image-edit-alias",
			body: { model: "gateway/image-edit-alias", prompt: "edit", image: "https://example.com/input.png" },
			meta: { requestId: "req_xai_alias_defaults", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
			workspaceId: "team_test", providerId: "x-ai", byokMeta: [],
			pricingCard: { rules: [
				{ meter: "input_image", unit: "image", unit_size: 1, price_per_unit: 0.01, currency: "USD", pricing_plan: "standard", match: [], priority: 100 },
				{ meter: "output_image", unit: "image", unit_size: 1, price_per_unit: 0.06, currency: "USD", pricing_plan: "standard", match: [
					{ path: "image_params.resolution", op: "eq", value: "1k" },
					{ path: "image_params.quality", op: "eq", value: "medium" },
				], priority: 100 },
			] },
			providerModelSlug: "grok-imagine-image-2.0", stream: false,
		} as any);
		mock.restore();

		expect(result.bill.cost_cents).toBe(7);
	});
});

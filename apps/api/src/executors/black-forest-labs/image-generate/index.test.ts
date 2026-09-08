import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execute } from "./index";
import type { ExecutorExecuteArgs } from "@executors/types";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const originalFetch = globalThis.fetch;

beforeAll(() => setupRuntimeFromEnv({
	BFL_API_KEY: "test-bfl-key",
	BFL_BASE_URL: "https://api.bfl.ai",
}));
afterAll(() => teardownTestRuntime());

function baseArgs(overrides?: Partial<ExecutorExecuteArgs>): ExecutorExecuteArgs {
	return {
		ir: {
			model: "black-forest-labs/flux-2-pro",
			prompt: "a lighthouse in a storm",
			size: "1024x1024",
			responseFormat: "url",
		},
		requestId: "req_bfl_test",
		workspaceId: "team_test",
		providerId: "black-forest-labs",
		endpoint: "images.generations",
		capability: "image.generate",
		providerModelSlug: "flux-2-pro",
		capabilityParams: {},
		maxInputTokens: null,
		maxOutputTokens: null,
		byokMeta: [{
			id: "byok_1",
			providerId: "black-forest-labs",
			fingerprintSha256: "fingerprint",
			keyVersion: null,
			alwaysUse: true,
			key: "bfl_key_test",
		}],
		pricingCard: null,
		meta: {},
		...overrides,
	} as ExecutorExecuteArgs;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("black-forest-labs image executor", () => {
	it("rejects five Klein references before submitting", async () => {
		globalThis.fetch = vi.fn();
		const result = await execute(baseArgs({ providerModelSlug: "flux-2-klein-4b", ir: { model: "flux-2-klein-4b", prompt: "Edit", image: Array.from({ length: 5 }, (_, n) => `https://example.com/${n}.png`) } }));
		expect(result.upstream?.status).toBe(400);
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});
	it("does not accept a completed image without settled credit usage", async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: "job", polling_url: "https://api.bfl.ai/v1/get_result?id=job" }))
			.mockResolvedValueOnce(Response.json({ status: "Ready", result: { sample: "https://example.com/out.png" } }));
		const result = await execute(baseArgs());
		expect(result.upstream?.status).toBe(502);
		expect(result.ir).toBeUndefined();
	});
	it("submits + polls BFL jobs and returns b64_json when requested", async () => {
		globalThis.fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_1",
				polling_url: "https://api.us1.bfl.ai/v1/get_result?id=job_1",
			}), { status: 200, headers: { "Content-Type": "application/json" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_1",
				status: "Ready",
				cost: 1.25,
				result: { sample: "https://cdn.bfl.ai/results/job_1.png" },
			}), { status: 200, headers: { "Content-Type": "application/json" } }))
			.mockResolvedValueOnce(new Response(Uint8Array.from([1, 2, 3]), {
				status: 200,
				headers: { "Content-Type": "image/png" },
			})) as any;

		const result = await execute(baseArgs({
			ir: {
				model: "black-forest-labs/flux-2-pro",
				prompt: "a lighthouse in a storm",
				size: "1024x1024",
				responseFormat: "b64_json",
			},
		}));

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;

		expect(globalThis.fetch).toHaveBeenCalledTimes(3);
		expect((globalThis.fetch as any).mock.calls[0][0]).toBe("https://api.bfl.ai/v1/flux-2-pro");
		expect(result.upstream.status).toBe(200);
		expect(result.ir).toBeTruthy();
		expect(result.ir?.data?.[0]?.b64Json).toBe("AQID");
		expect(result.ir?.data?.[0]?.url).toBeNull();
		expect((result.ir as any)?.usage?.requests).toBe(1);
		expect((result.ir as any)?.usage?.bfl_credits).toBe(1.25);
		expect(result.bill.cost_cents).toBe(1.25);
	});

	it("returns a gateway error when BFL polling reaches terminal moderation status", async () => {
		globalThis.fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_2",
				polling_url: "https://api.us1.bfl.ai/v1/get_result?id=job_2",
			}), { status: 200, headers: { "Content-Type": "application/json" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_2",
				status: "Content Moderated",
			}), { status: 200, headers: { "Content-Type": "application/json" } })) as any;

		const result = await execute(baseArgs());

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;

		expect(result.ir).toBeUndefined();
		expect(result.upstream.status).toBe(422);
	});

	it("supports images.edits when an input image is provided", async () => {
		globalThis.fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_3",
				polling_url: "https://api.us1.bfl.ai/v1/get_result?id=job_3",
			}), { status: 200, headers: { "Content-Type": "application/json" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_3",
				status: "Ready",
				cost: 4.5,
				result: { sample: "https://cdn.bfl.ai/results/job_3.png" },
			}), { status: 200, headers: { "Content-Type": "application/json" } })) as any;

		const result = await execute(baseArgs({
			endpoint: "images.edits",
			capability: "image.edit",
			ir: {
				model: "black-forest-labs/flux-2-pro",
				prompt: "change the sky to sunset",
				image: "https://cdn.example.com/source.png",
			},
		}));

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;

		expect(result.upstream.status).toBe(200);
		expect(result.ir?.data?.[0]?.url).toBe("https://cdn.bfl.ai/results/job_3.png");
	});

	it("returns 400 for images.edits without input image", async () => {
		const result = await execute(baseArgs({
			endpoint: "images.edits",
			capability: "image.edit",
			ir: {
				model: "black-forest-labs/flux-2-pro",
				prompt: "make this cinematic",
			},
		}));

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir).toBeUndefined();
		expect(result.upstream.status).toBe(400);
	});

	it("returns 400 for mask-based images.edits requests", async () => {
		const result = await execute(baseArgs({
			endpoint: "images.edits",
			capability: "image.edit",
			ir: {
				model: "black-forest-labs/flux-2-pro",
				prompt: "replace background",
				image: "https://cdn.example.com/source.png",
				mask: "https://cdn.example.com/mask.png",
			},
		}));

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir).toBeUndefined();
		expect(result.upstream.status).toBe(400);
	});

	it("maps all eight documented FLUX.2 API reference images", async () => {
		globalThis.fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: "job_8", polling_url: "https://api.bfl.ai/v1/get_result?id=job_8" }), { status: 200, headers: { "Content-Type": "application/json" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: "job_8", status: "Ready", result: { sample: "https://cdn.bfl.ai/results/job_8.png" } }), { status: 200, headers: { "Content-Type": "application/json" } })) as any;
		const images = Array.from({ length: 8 }, (_, index) => `https://example.com/reference-${index + 1}.png`);
		await execute(baseArgs({ endpoint: "images.edits", capability: "image.edit", meta: { returnUpstreamRequest: true }, ir: { model: "black-forest-labs/flux-2-pro", prompt: "compose these", image: images } }));
		const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
		expect(body.input_image).toBe(images[0]);
		expect(body.input_image_8).toBe(images[7]);
	});
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "./index";
import type { ExecutorExecuteArgs } from "@executors/types";

const originalFetch = globalThis.fetch;

function baseArgs(overrides?: Partial<ExecutorExecuteArgs>): ExecutorExecuteArgs {
	return {
		ir: {
			model: "black-forest-labs/flux-2-pro",
			prompt: "a lighthouse in a storm",
			size: "1024x1024",
			responseFormat: "url",
		},
		requestId: "req_bfl_test",
		teamId: "team_test",
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
	it("submits + polls BFL jobs and returns b64_json when requested", async () => {
		globalThis.fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_1",
				polling_url: "https://api.us1.bfl.ai/v1/get_result?id=job_1",
			}), { status: 200, headers: { "Content-Type": "application/json" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				id: "job_1",
				status: "Ready",
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
		expect((globalThis.fetch as any).mock.calls[0][0]).toBe("https://api.us1.bfl.ai/v1/flux-2-pro");
		expect(result.upstream.status).toBe(200);
		expect(result.ir).toBeTruthy();
		expect(result.ir?.data?.[0]?.b64Json).toBe("AQID");
		expect(result.ir?.data?.[0]?.url).toBeNull();
		expect((result.ir as any)?.usage?.requests).toBe(1);
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
});

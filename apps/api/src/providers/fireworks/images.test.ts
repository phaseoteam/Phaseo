import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute } from "@executors/_shared/non-text/adapter-bridge";
import { computeBill } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { installFetchMock } from "../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { fireworksWorkflowModelPath, sizeToAspectRatio } from "./images";

const WORKFLOW_PATH =
	"/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image";
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

// The live flux-1-schnell-fp8 row: $0.0014 per output image.
const card: PriceCard = {
	provider: "fireworks",
	model: "accounts/fireworks/models/flux-1-schnell-fp8",
	endpoint: "image.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [{
		pricing_plan: "standard",
		meter: "output_image",
		unit: "image",
		unit_size: 1,
		price_per_unit: "0.0014",
		currency: "USD",
		match: [],
		priority: 100,
	}] as any,
};

function run(body: Record<string, unknown>) {
	return execute({
		ir: { model: "fireworks/flux-1-schnell-fp8", prompt: "A red kite over a beach", ...body },
		requestId: "req_fireworks_flux",
		workspaceId: "team_test",
		providerId: "fireworks",
		providerModelSlug: "accounts/fireworks/models/flux-1-schnell-fp8",
		endpoint: "images.generations",
		byokMeta: [],
		pricingCard: card,
		meta: {},
	} as any);
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("fireworks FLUX image generation", () => {
	it("posts to the documented text_to_image workflow and returns the image as b64_json", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith(WORKFLOW_PATH),
				response: new Response(JPEG_BYTES, { status: 200, headers: { "Content-Type": "image/jpeg" } }),
			},
		]);
		const result = await run({ size: "1280x720", rawRequest: { seed: 7 } });
		mock.restore();

		expect(mock.calls).toHaveLength(1);
		expect(new URL(mock.calls[0]!.url).pathname).toBe(WORKFLOW_PATH);
		expect(mock.calls[0]?.headers.accept ?? mock.calls[0]?.headers.Accept).toBe("image/jpeg");
		expect(mock.calls[0]?.bodyJson).toEqual({ prompt: "A red kite over a beach", aspect_ratio: "16:9", seed: 7 });

		expect(result.kind).toBe("completed");
		const ir = (result as any).ir;
		expect(ir.outputFormat).toBe("jpeg");
		expect(ir.data).toEqual([{ url: null, b64Json: btoa(String.fromCharCode(...JPEG_BYTES)), revisedPrompt: null }]);
		expect((result as any).bill.usage).toEqual({ output_image: 1 });

		// One image at $0.0014.
		const priced = computeBill((result as any).bill.usage, card);
		expect(Number((priced.pricing as any)?.total_nanos)).toBe(1_400_000);
	});

	it("asks for PNG when output_format is png", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith(WORKFLOW_PATH),
				response: new Response(JPEG_BYTES, { status: 200, headers: { "Content-Type": "image/png" } }),
			},
		]);
		const result = await run({ outputFormat: "png" });
		mock.restore();

		expect(mock.calls[0]?.headers.accept ?? mock.calls[0]?.headers.Accept).toBe("image/png");
		expect(mock.calls[0]?.bodyJson).toEqual({ prompt: "A red kite over a beach" });
		expect((result as any).ir.outputFormat).toBe("png");
	});

	it("passes provider errors through without usage", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith(WORKFLOW_PATH),
				response: Response.json({ error: { message: "bad aspect ratio" } }, { status: 400 }),
			},
		]);
		const result = await run({ size: "1024x1792" });
		mock.restore();

		expect(result.kind).toBe("completed");
		expect((result as any).upstream.status).toBe(400);
		expect((result as any).bill.usage).toBeUndefined();
	});

	it("refuses n > 1 and url output before calling Fireworks", async () => {
		const mock = installFetchMock([]);
		const many = await run({ n: 2 });
		const url = await run({ responseFormat: "url" });
		mock.restore();

		expect((many as any).upstream.status).toBe(400);
		expect((url as any).upstream.status).toBe(400);
		expect(mock.calls).toHaveLength(0);
	});

	it("builds workflow paths and aspect ratios", () => {
		expect(fireworksWorkflowModelPath("flux-1-dev-fp8")).toBe("accounts/fireworks/models/flux-1-dev-fp8");
		expect(fireworksWorkflowModelPath("accounts/fireworks/models/flux-1-schnell-fp8")).toBe("accounts/fireworks/models/flux-1-schnell-fp8");
		expect(sizeToAspectRatio("1024x1024")).toBe("1:1");
		expect(sizeToAspectRatio("720x1280")).toBe("9:16");
		expect(sizeToAspectRatio("auto")).toBeUndefined();
	});
});

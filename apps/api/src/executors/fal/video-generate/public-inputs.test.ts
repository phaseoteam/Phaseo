import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { execute } from "./index";
import { VideoGenerationSchema } from "@core/schemas";
import { decodeOpenAIVideoRequestToIR } from "@pipeline/surfaces/video-codec";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@core/video-jobs", () => ({ saveVideoJobMeta: vi.fn(async () => undefined) }));
vi.mock("@core/video-reservations", () => ({
	isInsufficientVideoReservationStatus: () => false,
	reserveVideoGenerationCredits: vi.fn(async () => ({ reservationId: "hold", held: true, amountNanos: 100, status: "held" })),
}));
beforeAll(() => setupRuntimeFromEnv({ FAL_KEY: "test-fal-key" } as any));
afterAll(teardownTestRuntime);

describe("Fal public video input mapping", () => {
	it.each([false, true])("rejects incompatible frame inputs before reserving credits (mixed: %s)", async (mixed) => {
		const body = VideoGenerationSchema.parse({ model: "bytedance/seedance-2.0", prompt: "Forest", duration: 4,
			frame_images: [{ type: "image_url", frame_type: mixed ? "first_frame" : "last_frame", image_url: { url: "https://example.com/frame.png" } }],
			...(mixed ? { input_references: [{ type: "image_url", role: "reference", image_url: { url: "https://example.com/style.png" } }] } : {}),
		});
		vi.mocked(reserveVideoGenerationCredits).mockClear();
		const mock = installFetchMock([]);
		try {
			const result = await execute({ ir: decodeOpenAIVideoRequestToIR(body), providerModelSlug: body.model, meta: {} } as unknown as ExecutorExecuteArgs);
			expect(result.upstream?.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
			expect(reserveVideoGenerationCredits).not.toHaveBeenCalled();
		} finally { mock.restore(); }
	});
	it.each([false, true])("routes explicit frames through image-to-video (last frame: %s)", async (last) => {
		const frames = [{ type: "image_url", frame_type: "first_frame", image_url: { url: "https://example.com/start.png" } }];
		if (last) frames.push({ type: "image_url", frame_type: "last_frame", image_url: { url: "https://example.com/end.png" } });
		const result = await submit({ frame_images: frames });
		expect(result.url).toBe("https://queue.fal.run/bytedance/seedance-2.0/image-to-video");
		expect(result.bodyJson.image_url).toBe("https://example.com/start.png");
		expect(result.bodyJson.end_image_url).toBe(last ? "https://example.com/end.png" : undefined);
		expect(result.bodyJson.image_urls).toBeUndefined();
	});
	it("routes a single explicit reference without inventing a first frame", async () => {
		const result = await submit({ input_references: [{ type: "image_url", role: "reference", image_url: { url: "https://example.com/style.png" } }] });
		expect(result.url).toBe("https://queue.fal.run/bytedance/seedance-2.0/reference-to-video");
		expect(result.bodyJson.image_urls).toEqual(["https://example.com/style.png"]);
		expect(result.bodyJson.image_url).toBeUndefined();
	});
});

async function submit(input: Record<string, unknown>) {
	const ir = decodeOpenAIVideoRequestToIR(VideoGenerationSchema.parse({ model: "bytedance/seedance-2.0", prompt: "A forest", duration: 4, size: "720p", ...input }));
	const mock = installFetchMock([{ match: () => true, response: jsonResponse({ request_id: "fal-test-id" }) }]);
	try {
		const result = await execute({ ir, providerModelSlug: "bytedance/seedance-2.0", requestId: "req_fal_test", workspaceId: "test", providerId: "fal", byokMeta: [], meta: {} } as unknown as ExecutorExecuteArgs);
		expect(result.upstream?.status).toBeLessThan(300);
		expect(mock.calls).toHaveLength(1);
		return mock.calls[0];
	} finally { mock.restore(); }
}
